import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = (value: unknown) => JSON.stringify({ schemaVersion: 1, value });

beforeEach(() => { vi.resetModules(); localStorage.clear(); vi.unstubAllGlobals(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('GPSR 标签本地草稿', () => {
  it('首次读取时迁移旧品名、型号、批次和可复用图标', async () => {
    localStorage.setItem('emag:v1:profile.productName', stored('蓝牙耳机'));
    localStorage.setItem('emag:v1:profile.model', stored('B003'));
    localStorage.setItem('emag:v1:profile.batch', stored('LOT-OLD'));
    localStorage.setItem('emag:v1:profile.icons', stored(['ce', 'weee', 'pap20']));
    const { useGpsrLabelDraft } = await import('../src/storage/gpsrLabelDraft');
    const view = renderHook(() => useGpsrLabelDraft());

    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(view.result.current.draft.productName.zh).toBe('蓝牙耳机');
    expect(view.result.current.draft.model).toBe('B003');
    expect(view.result.current.draft.batch).toBe('LOT-OLD');
    expect(view.result.current.draft.icons).toEqual(['ce', 'weee']);
    expect(view.result.current.draft.labelSize).toBe('70x80');
  });

  it('用户已有 GPSR 草稿时不被旧表单中的残留数据覆盖', async () => {
    localStorage.setItem('emag:v1:profile.productName', stored('旧品名'));
    const draft = {
      productName: { zh: '新名称', ro: '', bg: '', hu: '' }, material: '', model: '', batch: 'LOT-1',
      ean13: '', manualUrl: '', labelSize: '70x80', customWidth: 70, customHeight: 80,
      orientation: 0, icons: [], warningId: 'none',
    };
    localStorage.setItem('emag:v1:gpsrLabel.draft', stored(draft));
    const { useGpsrLabelDraft } = await import('../src/storage/gpsrLabelDraft');
    const view = renderHook(() => useGpsrLabelDraft());
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(view.result.current.draft.productName.zh).toBe('新名称');
    expect(JSON.parse(localStorage.getItem('emag:v1:gpsrLabel.draft')!).value).toEqual(draft);
    act(() => view.result.current.setField('model', 'M-2'));
    expect(view.result.current.draft.model).toBe('M-2');
  });
});
