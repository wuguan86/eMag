import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const company = { name: '企业 A', address: '地址 A', email: 'a@example.com', phone: '100' };

describe('模板存储边界', () => {
  it('名称校验、角色隔离和默认删除后不擅自选择其他模板', async () => {
    const { useCompanyTemplates } = await import('../src/storage/companyTemplates');
    const view = renderHook(() => ({ rep: useCompanyTemplates('euRep'), manufacturer: useCompanyTemplates('manufacturer') }));
    await waitFor(() => expect(view.result.current.rep.loading).toBe(false));
    expect(() => view.result.current.rep.save('   ', company)).toThrow('不能为空');
    expect(() => view.result.current.rep.save('a'.repeat(81), company)).toThrow('80');
    act(() => { view.result.current.rep.save('  常用  ', company); view.result.current.manufacturer.save('常用', company); });
    const firstId = view.result.current.rep.library.defaultId!;
    expect(view.result.current.manufacturer.library.templates).toHaveLength(1);
    expect(() => view.result.current.rep.save(' 常用 ', company)).toThrow('已存在');
    act(() => view.result.current.rep.save('新副本', { ...company, name: '企业 B' }));
    const secondId = view.result.current.rep.library.selectedId!;
    act(() => view.result.current.rep.setDefault(secondId));
    act(() => view.result.current.rep.remove(firstId));
    expect(view.result.current.rep.library.defaultId).toBe(secondId);
    act(() => view.result.current.rep.remove(secondId));
    expect(view.result.current.rep.library).toEqual({ templates: [], defaultId: null, selectedId: null });
    expect(view.result.current.manufacturer.library.templates).toHaveLength(1);
  });

  it('整套企业切换仅通知完整资料，并在300毫秒后一起保存', async () => {
    vi.useFakeTimers();
    const { applyCompany, getCompanyCells } = await import('../src/storage/companyTemplates');
    const { subscribeStorageStatus } = await import('../src/storage/localStore');
    const cells = getCompanyCells('euRep');
    await Promise.resolve();
    const observed: unknown[] = [];
    const statusObserved: unknown[] = [];
    cells.name.subscribe(() => observed.push(Object.fromEntries(Object.entries(cells).map(([key, cell]) => [key, cell.getSnapshot().value]))));
    subscribeStorageStatus(() => statusObserved.push(Object.fromEntries(Object.entries(cells).map(([key, cell]) => [key, cell.getSnapshot().value]))));
    applyCompany('euRep', company);
    expect(observed).toEqual([company]);
    expect(statusObserved).toEqual([company]);
    expect(localStorage.length).toBe(0);
    await vi.advanceTimersByTimeAsync(299);
    expect(localStorage.length).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(JSON.parse(localStorage.getItem('emag:v1:profile.euRep.address')!).value).toBe('地址 A');
    expect(localStorage.length).toBe(4);
  });

  it('模板读取失败时拒绝另存，避免空库覆盖磁盘中的真实模板', async () => {
    vi.stubGlobal('chrome', { storage: {
      local: { get: async () => { throw new Error('读取失败'); }, set: async () => undefined },
      onChanged: { addListener: () => undefined },
    } });
    const { useCompanyTemplates } = await import('../src/storage/companyTemplates');
    const view = renderHook(() => useCompanyTemplates('euRep'));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(() => view.result.current.save('新公司', company)).toThrow('读取失败');
    expect(view.result.current.library.templates).toHaveLength(0);
  });

  it('跨窗口有效模板先到时，迟到的读盘失败不阻断已同步库的后续编辑', async () => {
    let changed!: (changes: Record<string, unknown>, area: string) => void;
    let failRead!: (error: Error) => void;
    vi.stubGlobal('chrome', { storage: {
      local: { get: () => new Promise((_resolve, reject) => { failRead = reject; }), set: async () => undefined },
      onChanged: { addListener: (listener: typeof changed) => { changed = listener; } },
    } });
    const { useCompanyTemplates } = await import('../src/storage/companyTemplates');
    const view = renderHook(() => useCompanyTemplates('euRep'));
    const remoteLibrary = { templates: [{ id: 'remote', name: '另一窗口', company }], defaultId: 'remote', selectedId: 'remote' };
    act(() => changed({ 'emag:v1:templates.euRep': { newValue: { schemaVersion: 1, value: remoteLibrary } } }, 'local'));
    await act(async () => { failRead(new Error('迟到的读取失败')); });
    act(() => view.result.current.save('本机新副本', company));
    expect(view.result.current.library.templates).toHaveLength(2);
  });

  it('模板跨窗口同步和迟到读盘不会丢失本地另存副本，保存失败可整体重试', async () => {
    let changed!: (changes: Record<string, unknown>, area: string) => void;
    let failWrite = true;
    const saved: Record<string, unknown> = {};
    vi.stubGlobal('chrome', { storage: {
      local: { get: async () => ({}), set: async (values: Record<string, unknown>) => { if (failWrite) throw new Error('测试保存失败'); Object.assign(saved, values); } },
      onChanged: { addListener: (listener: typeof changed) => { changed = listener; } },
    } });
    const { useCompanyTemplates } = await import('../src/storage/companyTemplates');
    const { flushStorage, getStorageStatus } = await import('../src/storage/localStore');
    const view = renderHook(() => useCompanyTemplates('euRep'));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    const remoteLibrary = { templates: [{ id: 'remote', name: '另一窗口', company }], defaultId: 'remote', selectedId: 'remote' };
    act(() => changed({ 'emag:v1:templates.euRep': { newValue: { schemaVersion: 1, value: remoteLibrary } } }, 'local'));
    expect(view.result.current.library.templates[0].name).toBe('另一窗口');
    act(() => view.result.current.save('本机新副本', { ...company, name: '企业 B' }));
    act(() => changed({ 'emag:v1:templates.euRep': { newValue: { schemaVersion: 1, value: remoteLibrary } } }, 'local'));
    expect(view.result.current.library.templates).toHaveLength(2);
    await act(flushStorage);
    expect(getStorageStatus().error).toContain('保存失败');
    expect(view.result.current.library.templates).toHaveLength(2);
    failWrite = false;
    await act(flushStorage);
    expect(getStorageStatus().error).toBeNull();
    expect((saved['emag:v1:templates.euRep'] as { value: { templates: unknown[] } }).value.templates).toHaveLength(2);
  });
});
