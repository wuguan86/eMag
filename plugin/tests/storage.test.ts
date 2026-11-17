import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('本地字段存储', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('快速修改在延迟读盘返回后仍保留，且不同字段分别保存', async () => {
    let finishRead: (value: Record<string, unknown>) => void = () => undefined;
    const saved: Record<string, unknown> = {};
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: () => new Promise((resolve) => { finishRead = resolve; }),
          set: async (items: Record<string, unknown>) => { Object.assign(saved, items); },
        },
        onChanged: { addListener: () => undefined },
      },
    });
    const { getLocalCell, flushStorage } = await import('../src/storage/localStore');
    const company = getLocalCell('test.company', '', (value): value is string => typeof value === 'string');
    company.set('新公司');
    finishRead({ 'emag:v1:test.company': { schemaVersion: 1, value: '旧公司' } });
    await Promise.resolve();
    expect(company.getSnapshot().value).toBe('新公司');
    await flushStorage();
    expect(saved['emag:v1:test.company']).toEqual({ schemaVersion: 1, value: '新公司' });
  });

  it('无法识别的存储数据不进入表单', async () => {
    localStorage.setItem('emag:v1:test.value', JSON.stringify({ schemaVersion: 8, value: 123 }));
    const { getLocalCell } = await import('../src/storage/localStore');
    const cell = getLocalCell('test.value', '默认值', (value): value is string => typeof value === 'string');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cell.getSnapshot().value).toBe('默认值');
  });

  it('保存失败仍保留输入并可重新保存', async () => {
    let failWrite = true;
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async () => ({}),
          set: async () => { if (failWrite) throw new Error('磁盘拒绝'); },
        },
        onChanged: { addListener: () => undefined },
      },
    });
    const { getLocalCell, flushStorage, getStorageStatus } = await import('../src/storage/localStore');
    const cell = getLocalCell('test.email', '', (value): value is string => typeof value === 'string');
    cell.set('seller@example.com');
    await flushStorage();
    expect(cell.getSnapshot().value).toBe('seller@example.com');
    expect(getStorageStatus().error).toContain('保存失败');
    failWrite = false;
    await flushStorage();
    expect(getStorageStatus().error).toBeNull();
  });

  it('跨窗口新值先到达时，迟到的初始化读取不能覆盖它', async () => {
    let finishRead: (value: unknown) => void = () => undefined;
    let onChanged: (changes: Record<string, unknown>, area: string) => void = () => undefined;
    vi.stubGlobal('chrome', {
      storage: {
        local: { get: () => new Promise((resolve) => { finishRead = resolve; }), set: async () => undefined },
        onChanged: { addListener: (listener: typeof onChanged) => { onChanged = listener; } },
      },
    });
    const { getLocalCell } = await import('../src/storage/localStore');
    const cell = getLocalCell('test.sync', '', (value): value is string => typeof value === 'string');
    onChanged({ 'emag:v1:test.sync': { newValue: { schemaVersion: 1, value: '新公司' } } }, 'local');
    finishRead({ 'emag:v1:test.sync': { schemaVersion: 1, value: '旧公司' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cell.getSnapshot().value).toBe('新公司');
  });
});
