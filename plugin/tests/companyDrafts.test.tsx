import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const company = { name: '默认公司', address: '默认地址', email: 'default@example.com', phone: '123' };
const envelope = (value: unknown) => ({ schemaVersion: 1, value });
const library = { templates: [{ id: 'first', name: '默认模板', company }], defaultId: 'first', selectedId: 'first' };
const libraryKey = 'emag:v1:templates.euRep';

beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('企业模板与现有草稿', () => {
  it('默认模板初始化后，下拉选中项反映实际应用的模板', async () => {
    localStorage.setItem(libraryKey, JSON.stringify(envelope({ ...library, selectedId: null })));
    const { useComplianceProfile } = await import('../src/storage/profile');
    const { getCompanyTemplateCell } = await import('../src/storage/companyTemplates');
    const view = renderHook(() => useComplianceProfile());
    await waitFor(() => expect(view.result.current.profile.euRep.name).toBe('默认公司'));
    expect(getCompanyTemplateCell('euRep').getSnapshot().value.selectedId).toBe('first');
  });
  it('无任何主体字段存储记录时应用默认模板，并完整保留已存空字段', async () => {
    localStorage.setItem(libraryKey, JSON.stringify(envelope(library)));
    localStorage.setItem('emag:v1:profile.manufacturer.name', JSON.stringify(envelope('')));
    localStorage.setItem('emag:v1:templates.manufacturer', JSON.stringify(envelope(library)));
    const { useComplianceProfile } = await import('../src/storage/profile');
    const view = renderHook(() => useComplianceProfile());
    await waitFor(() => expect(view.result.current.profile.euRep.name).toBe('默认公司'));
    expect(view.result.current.profile.manufacturer.name).toBe('');
    expect(view.result.current.profile.manufacturer.address).toBe('');
  });

  it('等待所有字段读盘，且不覆盖读盘期间输入或先到的跨窗口新值', async () => {
    const reads = new Map<string, (value: unknown) => void>();
    let changed!: (changes: Record<string, unknown>, area: string) => void;
    vi.stubGlobal('chrome', { storage: {
      local: { get: (key: string) => new Promise((resolve) => reads.set(key, resolve)), set: async () => undefined },
      onChanged: { addListener: (listener: typeof changed) => { changed = listener; } },
    } });
    const { useComplianceProfile } = await import('../src/storage/profile');
    const view = renderHook(() => useComplianceProfile());
    await act(async () => { reads.get(libraryKey)?.({ [libraryKey]: envelope(library) }); });
    expect(view.result.current.profile.euRep.name).toBe('');
    act(() => view.result.current.setEuRep('name', '正在输入'));
    act(() => changed({ 'emag:v1:profile.euRep.address': { newValue: envelope('另一窗口地址') } }, 'local'));
    await act(async () => { for (const [key, finish] of reads) finish({ [key]: undefined }); });
    expect(view.result.current.profile.euRep).toEqual({ name: '正在输入', address: '另一窗口地址', email: '', phone: '' });
  });

  it('微调后重挂载仍恢复草稿，已保存模板不被修改', async () => {
    localStorage.setItem(libraryKey, JSON.stringify(envelope(library)));
    const { useComplianceProfile } = await import('../src/storage/profile');
    const { flushStorage } = await import('../src/storage/localStore');
    const view = renderHook(() => useComplianceProfile());
    await waitFor(() => expect(view.result.current.profile.euRep.name).toBe('默认公司'));
    act(() => view.result.current.setEuRep('address', '临时地址'));
    await act(flushStorage);
    view.unmount();
    const reopened = renderHook(() => useComplianceProfile());
    expect(reopened.result.current.profile.euRep.address).toBe('临时地址');
    expect(JSON.parse(localStorage.getItem(libraryKey)!).value.templates[0].company.address).toBe('默认地址');
    reopened.unmount();
    vi.resetModules();
    const reloaded = await import('../src/storage/profile');
    const fresh = renderHook(() => reloaded.useComplianceProfile());
    await waitFor(() => expect(fresh.result.current.profile.euRep.address).toBe('临时地址'));
  });
});
