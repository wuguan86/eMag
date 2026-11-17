type Validator<T> = (value: unknown) => value is T;
type Subscriber = () => void;
interface Envelope { schemaVersion: 1; value: unknown; groupRevision?: string; writeId?: string }
interface AtomicGroup { keys: string[]; editVersion: number }
interface GroupWrite { group: AtomicGroup; keys: string[]; editVersion: number; superseded: boolean }
interface CellSnapshot<T> { value: T; loading: boolean; present: boolean; readFailed: boolean }
export interface LocalCell<T> {
  getSnapshot: () => CellSnapshot<T>;
  subscribe: (listener: Subscriber) => () => void;
  set: (value: T, groupRevision?: string) => void;
}

const prefix = 'emag:v1:';
const cells = new Map<string, LocalCell<unknown>>();
const receivers = new Map<string, (value: unknown) => void>();
const validators = new Map<string, Validator<unknown>>();
const atomicGroups = new Map<string, AtomicGroup>();
const sentGroupWrites = new Map<string, GroupWrite>();
const pending = new Map<string, Envelope>();
const statusSubscribers = new Set<Subscriber>();
let status: { error: string | null; saving: boolean } = { error: null, saving: false };
let timer: ReturnType<typeof setTimeout> | undefined;
let listening = false;
let activeWrite: Promise<void> | null = null;
let activeBatch: Record<string, Envelope> | null = null;
let batchDepth = 0;
const deferredNotifications = new Set<Subscriber>();

export function registerAtomicLocalGroup(names: readonly string[]) {
  const keys = names.map((name) => prefix + name);
  const id = JSON.stringify(keys);
  if (!atomicGroups.has(id)) atomicGroups.set(id, { keys, editVersion: 0 });
}

function acceptOwnChanges(changes: Record<string, chrome.storage.StorageChange>) {
  const handled = new Set<string>();
  for (const stored of Object.values(changes).map((change) => change.newValue)) {
    if (!isEnvelope(stored) || !stored.writeId) continue;
    const write = sentGroupWrites.get(stored.writeId);
    if (!write || !write.keys.every((key) => {
      const incoming = changes[key]?.newValue;
      return isEnvelope(incoming) && incoming.writeId === stored.writeId;
    })) continue;
    // 用户编辑序号不因远端接纳而变化；未过期的自身回声仍按事件顺序接纳，保证窗口收敛。
    const obsolete = write.superseded || write.group.editVersion > write.editVersion;
    for (const key of write.keys) {
      handled.add(key);
      if (!obsolete) receivers.get(key)?.(changes[key].newValue);
    }
    sentGroupWrites.delete(stored.writeId);
  }
  return handled;
}

function acceptAtomicChanges(changes: Record<string, chrome.storage.StorageChange>, handled: Set<string>) {
  for (const group of atomicGroups.values()) {
    const { keys } = group;
    if (keys.some((key) => handled.has(key))) continue;
    const entries = keys.map((key) => ({ key, cell: cells.get(key), stored: changes[key]?.newValue }));
    if (!entries.every(({ key, cell, stored }) => cell && isEnvelope(stored) && validators.get(key)?.(stored.value))) continue;
    const repairNeeded = keys.some((key) => pending.has(key) || activeBatch?.[key]);
    for (const key of keys) {
      const activeId = activeBatch?.[key]?.writeId;
      const sentWrite = activeId ? sentGroupWrites.get(activeId) : undefined;
      if (sentWrite) sentWrite.superseded = true;
    }
    for (const { key, stored } of entries) {
      handled.add(key);
      receivers.get(key)?.(stored);
      // 只有本地旧待写或在途写可能覆盖磁盘时才整组修复，普通同步不制造额外写回。
      if (repairNeeded) pending.set(key, stored as Envelope);
    }
    if (repairNeeded) scheduleWrite();
  }
  return handled;
}

// 企业模板切换先更新所有字段，再通知订阅方，避免出现新旧资料混合的中间状态。
export function batchLocalUpdates(update: () => void) {
  batchDepth++;
  try { update(); }
  finally {
    batchDepth--;
    if (!batchDepth) {
      const listeners = [...deferredNotifications];
      deferredNotifications.clear();
      listeners.forEach((listener) => listener());
    }
  }
}

function extensionStorage() {
  return globalThis.chrome?.storage?.local;
}

function updateStatus(error: string | null, saving: boolean) {
  status = { error, saving };
  statusSubscribers.forEach((listener) => {
    if (batchDepth) deferredNotifications.add(listener);
    else listener();
  });
}

function scheduleWrite() {
  updateStatus(status.error, true);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void flushStorage(); }, 300);
}

export const getStorageStatus = () => status;
export function subscribeStorageStatus(listener: Subscriber) {
  statusSubscribers.add(listener);
  return () => { statusSubscribers.delete(listener); };
}

function isEnvelope(value: unknown): value is Envelope {
  return typeof value === 'object' && value !== null
    && 'schemaVersion' in value && value.schemaVersion === 1 && 'value' in value
    && (!('groupRevision' in value) || typeof value.groupRevision === 'string')
    && (!('writeId' in value) || typeof value.writeId === 'string');
}

function installListeners() {
  if (listening) return;
  listening = true;
  if (extensionStorage()) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      batchLocalUpdates(() => {
        const handled = acceptOwnChanges(changes);
        acceptAtomicChanges(changes, handled);
        for (const [key, change] of Object.entries(changes)) {
          // 当前窗口尚未保存的编辑优先，避免外部事件覆盖用户正在输入的字段。
          if (!handled.has(key) && !pending.has(key)) receivers.get(key)?.(change.newValue);
        }
      });
    });
  } else {
    window.addEventListener('storage', (event) => {
      if (!event.key || pending.has(event.key)) return;
      try { receivers.get(event.key)?.(event.newValue ? JSON.parse(event.newValue) : undefined); }
      catch { console.warn('本地存储同步数据格式无效，已忽略。'); }
    });
  }
  // Popup 关闭前立即发出已排队的写入，避免防抖间隔内关闭导致输入丢失。
  window.addEventListener('pagehide', () => { void flushStorage(); });
}

export async function flushStorage(): Promise<void> {
  if (timer) clearTimeout(timer);
  if (activeWrite) {
    await activeWrite;
    if (pending.size && !status.error) await flushStorage();
    return;
  }
  if (!pending.size) return;
  const batch = Object.fromEntries(pending);
  for (const group of extensionStorage() ? atomicGroups.values() : []) {
    const keys = group.keys.filter((key) => batch[key]);
    if (!keys.length) continue;
    // 写入标识每次实际发送都更新，与模板动作修订号分开，避免把远端修复写误认成自身回声。
    const writeId = crypto.randomUUID();
    sentGroupWrites.set(writeId, { group, keys, editVersion: group.editVersion, superseded: false });
    for (const key of keys) {
      batch[key] = { ...batch[key], writeId };
      pending.set(key, batch[key]);
    }
  }
  activeBatch = batch;
  updateStatus(null, true);
  activeWrite = (async () => {
    try {
      if (extensionStorage()) await chrome.storage.local.set(batch);
      else for (const [key, value] of Object.entries(batch)) localStorage.setItem(key, JSON.stringify(value));
      for (const [key, value] of Object.entries(batch)) {
        if (pending.get(key) === value) pending.delete(key);
      }
      updateStatus(null, pending.size > 0);
    } catch (error) {
      for (const stored of Object.values(batch)) if (stored.writeId) sentGroupWrites.delete(stored.writeId);
      console.warn('本地保存失败，输入仍保留在当前窗口。', error);
      updateStatus('保存失败，输入仍保留，请重试保存。', false);
    }
  })();
  await activeWrite;
  activeWrite = null;
  activeBatch = null;
  if (pending.size && !status.error) await flushStorage();
}

export function getLocalCell<T>(name: string, fallback: T, validate: Validator<T>): LocalCell<T> {
  const key = prefix + name;
  const cached = cells.get(key);
  if (cached) return cached as LocalCell<T>;
  validators.set(key, validate as Validator<unknown>);
  installListeners();
  const subscribers = new Set<Subscriber>();
  let snapshot: CellSnapshot<T> = { value: fallback, loading: true, present: false, readFailed: false };
  let edited = false;
  let receivedUpdate = false;
  const notify = () => subscribers.forEach((listener) => {
    if (batchDepth) deferredNotifications.add(listener);
    else listener();
  });
  const accept = (stored: unknown) => {
    // 存在记录但格式无效时也不能用模板静默覆盖已有草稿。
    snapshot = { ...snapshot, loading: false, present: stored !== undefined && stored !== null, readFailed: false };
    if (isEnvelope(stored) && validate(stored.value)) {
      snapshot = { ...snapshot, value: stored.value };
    } else if (stored === undefined || stored === null) {
      snapshot = { ...snapshot, value: fallback };
    }
    notify();
  };
  const cell: LocalCell<T> = {
    getSnapshot: () => snapshot,
    subscribe(listener) { subscribers.add(listener); return () => { subscribers.delete(listener); }; },
    set(value, groupRevision) {
      if (!validate(value)) return;
      for (const group of atomicGroups.values()) if (group.keys.includes(key)) group.editVersion++;
      edited = true;
      snapshot = { value, loading: false, present: true, readFailed: false };
      pending.set(key, groupRevision === undefined ? { schemaVersion: 1, value } : { schemaVersion: 1, value, groupRevision });
      notify();
      scheduleWrite();
    },
  };
  cells.set(key, cell as LocalCell<unknown>);
  receivers.set(key, (stored) => { receivedUpdate = true; accept(stored); });
  void (async () => {
    try {
      const stored = extensionStorage()
        ? (await chrome.storage.local.get(key))[key]
        : JSON.parse(localStorage.getItem(key) ?? 'null');
      if (!edited && !receivedUpdate) accept(stored);
    } catch (error) {
      // 已有用户输入或跨窗口新数据时，迟到的读取失败不能使有效状态失效。
      if (!edited && !receivedUpdate) {
        snapshot = { ...snapshot, readFailed: true };
        console.warn('本地数据读取失败，已使用默认值。', error);
        updateStatus('本地数据读取失败，当前显示默认值。', false);
      }
    } finally {
      snapshot = { ...snapshot, loading: false };
      notify();
    }
  })();
  return cell;
}
