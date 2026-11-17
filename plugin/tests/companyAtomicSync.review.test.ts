import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); localStorage.clear(); });
afterEach(async () => {
  const { flushStorage } = await import('../src/storage/localStore');
  await flushStorage();
  vi.unstubAllGlobals();
});

it('模板应用后先微调再保存的迟到整批回声不能覆盖保存后继续输入的名称', async () => {
  let changed!: (changes: Record<string, unknown>, area: string) => void;
  let firstBatch!: Record<string, unknown>;
  vi.stubGlobal('chrome', { storage: {
    local: {
      get: async () => ({}),
      set: async (values: Record<string, unknown>) => { firstBatch ??= values; },
    },
    onChanged: { addListener: (listener: typeof changed) => { changed = listener; } },
  } });
  const { applyCompany, getCompanyCells } = await import('../src/storage/companyTemplates');
  const { flushStorage } = await import('../src/storage/localStore');
  const cells = getCompanyCells('euRep');
  await Promise.resolve();
  applyCompany('euRep', { name: '模板名称', address: '模板地址', email: 'template@example.com', phone: '123' });
  // 防抖期内的微调会替换单字段信封，整批仍包含首次写入的四个有效键。
  cells.name.set('应用模板后第一次微调');
  await flushStorage();
  cells.name.set('保存后继续输入的新名称');
  changed(Object.fromEntries(Object.entries(firstBatch).map(([key, newValue]) => [key, { newValue }])), 'local');
  expect(cells.name.getSnapshot().value).toBe('保存后继续输入的新名称');
});

it('两个窗口写入完成后才按顺序收到事件时，完整模板冲突必须最终收敛到磁盘快照', async () => {
  const saved: Record<string, unknown> = {};
  const listeners: ((changes: Record<string, unknown>, area: string) => void)[] = [];
  const eventQueue: Record<string, unknown>[] = [];
  vi.stubGlobal('chrome', { storage: {
    local: {
      get: async (key: string) => ({ [key]: saved[key] }),
      set: async (values: Record<string, unknown>) => {
        const changes = Object.fromEntries(Object.entries(values)
          .filter(([key, value]) => JSON.stringify(saved[key]) !== JSON.stringify(value))
          .map(([key, newValue]) => [key, { newValue }]));
        Object.assign(saved, values);
        if (Object.keys(changes).length) eventQueue.push(changes);
      },
    },
    onChanged: { addListener: (listener: typeof listeners[number]) => { listeners.push(listener); } },
  } });
  const firstWindow = await import('../src/storage/companyTemplates');
  const firstStorage = await import('../src/storage/localStore');
  const firstCells = firstWindow.getCompanyCells('euRep');
  await Promise.resolve();
  vi.resetModules();
  const secondWindow = await import('../src/storage/companyTemplates');
  const secondStorage = await import('../src/storage/localStore');
  const secondCells = secondWindow.getCompanyCells('euRep');
  await Promise.resolve();
  firstWindow.applyCompany('euRep', { name: '企业 A', address: '地址 A', email: 'a@example.com', phone: '111' });
  await firstStorage.flushStorage();
  secondWindow.applyCompany('euRep', { name: '企业 B', address: '地址 B', email: 'b@example.com', phone: '222' });
  await secondStorage.flushStorage();
  // 保持每个窗口事件顺序一致，只延后 Promise 已完成的通知，模拟合法的晚回声。
  for (let round = 0; round < 4; round++) {
    for (const changes of eventQueue.splice(0)) listeners.forEach((listener) => listener(changes, 'local'));
    await firstStorage.flushStorage();
    await secondStorage.flushStorage();
  }
  const diskCompany = Object.fromEntries(Object.keys(firstCells)
    .map((field) => [field, (saved[`emag:v1:profile.euRep.${field}`] as { value: string }).value]));
  const currentCompany = (cells: typeof firstCells) => Object.fromEntries(Object.entries(cells)
    .map(([field, cell]) => [field, cell.getSnapshot().value]));
  expect(currentCompany(firstCells)).toEqual(diskCompany);
  expect(currentCompany(secondCells)).toEqual(diskCompany);
  expect(eventQueue).toHaveLength(0);
});

it('真正远端的混合修订号完整快照仍应覆盖本地局部待写并整组保存', async () => {
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
  cells.name.set('本地局部待写名称');
  const remoteCompany = { name: '远端微调名称', address: '远端模板地址', email: 'remote@example.com', phone: '999' };
  const remoteBatch = Object.fromEntries(Object.entries(remoteCompany).map(([field, value]) => [
    `emag:v1:profile.euRep.${field}`,
    field === 'name' ? { schemaVersion: 1, value } : { schemaVersion: 1, value, groupRevision: 'remote-template-revision' },
  ]));
  Object.assign(saved, remoteBatch);
  changed(Object.fromEntries(Object.entries(remoteBatch).map(([key, newValue]) => [key, { newValue }])), 'local');
  expect(Object.fromEntries(Object.entries(cells).map(([field, cell]) => [field, cell.getSnapshot().value]))).toEqual(remoteCompany);
  await flushStorage();
  expect(Object.fromEntries(Object.keys(remoteCompany).map((field) => [field, (saved[`emag:v1:profile.euRep.${field}`] as { value: string }).value]))).toEqual(remoteCompany);
});
