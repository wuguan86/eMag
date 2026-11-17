import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const remoteCompany = { name: '远端企业', address: '远端地址', email: 'remote@example.com', phone: '200' };
const envelope = (value: unknown) => ({ schemaVersion: 1, value });
const companyEntries = (company: Record<string, string>) => Object.fromEntries(Object.entries(company).map(([field, value]) => [`emag:v1:profile.euRep.${field}`, envelope(value)]));
const changesFor = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }]));

beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('跨窗口企业资料原子接纳', () => {
  it('Chrome只通知实际变化键时，仅名称不同的模板仍以同一修订号触发四字段同步', async () => {
    vi.useFakeTimers();
    const originalCompany = { name: '原企业', address: '', email: '', phone: '' };
    const saved: Record<string, unknown> = companyEntries(originalCompany);
    const listeners: ((changes: Record<string, unknown>, area: string) => void)[] = [];
    const events: string[][] = [];
    vi.stubGlobal('chrome', { storage: {
      local: {
        get: async (key: string) => ({ [key]: saved[key] }),
        set: async (values: Record<string, unknown>) => {
          const changedValues = Object.fromEntries(Object.entries(values).filter(([key, value]) => JSON.stringify(saved[key]) !== JSON.stringify(value)));
          Object.assign(saved, values);
          if (Object.keys(changedValues).length) {
            events.push(Object.keys(changedValues));
            if (events.length > 5) throw new Error('检测到跨窗口重复写回');
            listeners.forEach((listener) => listener(changesFor(changedValues), 'local'));
          }
        },
      },
      onChanged: { addListener: (listener: typeof listeners[number]) => { listeners.push(listener); } },
    } });
    const firstWindow = await import('../src/storage/companyTemplates');
    const firstStorage = await import('../src/storage/localStore');
    const firstCells = firstWindow.getCompanyCells('euRep');
    await Promise.resolve();
    firstCells.name.set('第一窗口未保存名称');
    vi.resetModules();
    const secondWindow = await import('../src/storage/companyTemplates');
    const secondStorage = await import('../src/storage/localStore');
    secondWindow.getCompanyCells('euRep');
    await Promise.resolve();
    secondWindow.applyCompany('euRep', { ...originalCompany, name: '第二窗口选择模板' });
    await secondStorage.flushStorage();
    await firstStorage.flushStorage();
    expect(firstCells.name.getSnapshot().value).toBe('第二窗口选择模板');
    expect(events).toHaveLength(2);
    expect(events[0]).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(600);
    expect(events).toHaveLength(2);
    const revisions = Object.values(saved).map((stored) => (stored as { groupRevision?: string }).groupRevision);
    expect(revisions.every((revision) => typeof revision === 'string' && revision.length > 0)).toBe(true);
    expect(new Set(revisions).size).toBe(1);
  });
  it('本地仅名称待写时，远端完整四字段整体优先，不产生混合企业资料', async () => {
    let changed!: (changes: Record<string, unknown>, area: string) => void;
    const saved: Record<string, unknown> = {};
    vi.stubGlobal('chrome', { storage: {
      local: { get: async () => ({}), set: async (values: Record<string, unknown>) => { Object.assign(saved, values); changed(changesFor(values), 'local'); } },
      onChanged: { addListener: (listener: typeof changed) => { changed = listener; } },
    } });
    const { getCompanyCells } = await import('../src/storage/companyTemplates');
    const { flushStorage } = await import('../src/storage/localStore');
    const cells = getCompanyCells('euRep');
    await Promise.resolve();
    cells.name.set('本地旧名称');
    const observed: unknown[] = [];
    cells.name.subscribe(() => observed.push(Object.fromEntries(Object.entries(cells).map(([field, cell]) => [field, cell.getSnapshot().value]))));
    const remoteValues = companyEntries(remoteCompany);
    Object.assign(saved, remoteValues);
    changed(changesFor(remoteValues), 'local');
    expect(Object.fromEntries(Object.entries(cells).map(([field, cell]) => [field, cell.getSnapshot().value]))).toEqual(remoteCompany);
    expect(observed).toEqual([remoteCompany]);
    await flushStorage();
    expect(saved).toMatchObject(remoteValues);
  });

  it('旧名称写入在途时，完整远端快照重新整组排队并最终修复磁盘，自己的回声不会循环', async () => {
    vi.useFakeTimers();
    let changed!: (changes: Record<string, unknown>, area: string) => void;
    let finishOldWrite!: () => void;
    const saved: Record<string, unknown> = {};
    const writes: Record<string, unknown>[] = [];
    vi.stubGlobal('chrome', { storage: {
      local: {
        get: async () => ({}),
        set: async (values: Record<string, unknown>) => {
          writes.push(values);
          if (writes.length === 1) await new Promise<void>((resolve) => { finishOldWrite = resolve; });
          if (writes.length > 4) throw new Error('检测到重复写回循环');
          Object.assign(saved, values); changed(changesFor(values), 'local');
        },
      },
      onChanged: { addListener: (listener: typeof changed) => { changed = listener; } },
    } });
    const { getCompanyCells, getCompanyTemplateCell } = await import('../src/storage/companyTemplates');
    const { flushStorage } = await import('../src/storage/localStore');
    const cells = getCompanyCells('euRep');
    const templates = getCompanyTemplateCell('euRep');
    await Promise.resolve();
    cells.name.set('在途旧名称');
    const flushing = flushStorage();
    const remoteValues = companyEntries(remoteCompany);
    const remoteLibrary = { templates: [{ id: 'new-remote', name: '远端新增模板', company: remoteCompany }], defaultId: 'new-remote', selectedId: 'new-remote' };
    const remoteBatch = { ...remoteValues, 'emag:v1:templates.euRep': envelope(remoteLibrary) };
    Object.assign(saved, remoteBatch); changed(changesFor(remoteBatch), 'local');
    finishOldWrite();
    await flushing;
    expect(Object.fromEntries(Object.entries(cells).map(([field, cell]) => [field, cell.getSnapshot().value]))).toEqual(remoteCompany);
    expect(saved).toMatchObject(remoteBatch);
    expect(templates.getSnapshot().value.templates[0].name).toBe('远端新增模板');
    expect(writes).toHaveLength(2);
    expect(Object.keys(writes[1])).toHaveLength(4);
    const firstId = (Object.values(writes[0])[0] as { writeId: string }).writeId;
    const repairIds = Object.values(writes[1]).map((stored) => (stored as { writeId: string }).writeId);
    expect(repairIds.every((id) => id && id !== firstId)).toBe(true);
    expect(new Set(repairIds).size).toBe(1);
    await vi.advanceTimersByTimeAsync(600);
    expect(writes).toHaveLength(2);
  });

  it('远端只改单个字段时仍保留本地待写优先规则', async () => {
    let changed!: (changes: Record<string, unknown>, area: string) => void;
    const saved: Record<string, unknown> = {};
    vi.stubGlobal('chrome', { storage: {
      local: { get: async () => ({}), set: async (values: Record<string, unknown>) => { Object.assign(saved, values); } },
      onChanged: { addListener: (listener: typeof changed) => { changed = listener; } },
    } });
    const { getCompanyCells } = await import('../src/storage/companyTemplates');
    const { flushStorage } = await import('../src/storage/localStore');
    const cells = getCompanyCells('euRep');
    await Promise.resolve();
    cells.name.set('本地名称优先');
    changed(changesFor({ 'emag:v1:profile.euRep.name': envelope('远端名称') }), 'local');
    changed(changesFor({ 'emag:v1:profile.euRep.address': envelope('远端单字段地址') }), 'local');
    expect(cells.name.getSnapshot().value).toBe('本地名称优先');
    expect(cells.address.getSnapshot().value).toBe('远端单字段地址');
    await flushStorage();
    expect(saved['emag:v1:profile.euRep.name']).toMatchObject(envelope('本地名称优先'));
  });

  it('本窗口旧整组写入的迟到回声不能撤销后来接纳的远端完整快照', async () => {
    let changed!: (changes: Record<string, unknown>, area: string) => void;
    let finishOldWrite!: () => void;
    const saved: Record<string, unknown> = {};
    let writeCount = 0;
    vi.stubGlobal('chrome', { storage: {
      local: { get: async () => ({}), set: async (values: Record<string, unknown>) => {
        if (++writeCount === 1) await new Promise<void>((resolve) => { finishOldWrite = resolve; });
        Object.assign(saved, values); changed(changesFor(values), 'local');
      } },
      onChanged: { addListener: (listener: typeof changed) => { changed = listener; } },
    } });
    const { applyCompany, getCompanyCells } = await import('../src/storage/companyTemplates');
    const { flushStorage } = await import('../src/storage/localStore');
    const cells = getCompanyCells('euRep');
    await Promise.resolve();
    applyCompany('euRep', { name: '在途旧企业', address: '在途旧地址', email: 'old@example.com', phone: '100' });
    const flushing = flushStorage();
    const remoteValues = companyEntries(remoteCompany);
    Object.assign(saved, remoteValues); changed(changesFor(remoteValues), 'local');
    finishOldWrite();
    await flushing;
    expect(Object.fromEntries(Object.entries(cells).map(([field, cell]) => [field, cell.getSnapshot().value]))).toEqual(remoteCompany);
    expect(saved).toMatchObject(remoteValues);
    expect(writeCount).toBe(2);
  });

  it('保存Promise已完成后才到达的整组回声也不覆盖新的单字段微调', async () => {
    let changed!: (changes: Record<string, unknown>, area: string) => void;
    let firstBatch!: Record<string, unknown>;
    vi.stubGlobal('chrome', { storage: {
      local: { get: async () => ({}), set: async (values: Record<string, unknown>) => { firstBatch ??= values; } },
      onChanged: { addListener: (listener: typeof changed) => { changed = listener; } },
    } });
    const { applyCompany, getCompanyCells } = await import('../src/storage/companyTemplates');
    const { flushStorage } = await import('../src/storage/localStore');
    const cells = getCompanyCells('euRep');
    await Promise.resolve();
    applyCompany('euRep', remoteCompany);
    await flushStorage();
    cells.name.set('保存后新微调');
    changed(changesFor(firstBatch), 'local');
    expect(cells.name.getSnapshot().value).toBe('保存后新微调');
    await flushStorage();
  });
});
