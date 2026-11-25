import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.resetModules(); vi.unstubAllGlobals(); });

describe('工具栏侧边栏入口', () => {
  it('工具栏动作打开全高侧边栏而不是受限高度弹窗', () => {
    const manifest = JSON.parse(readFileSync(resolve('manifest.json'), 'utf8')) as {
      permissions: string[]; action: { default_popup?: string }; side_panel?: { default_path: string };
    };
    expect(manifest.permissions).toContain('sidePanel');
    expect(manifest.action.default_popup).toBeUndefined();
    expect(manifest.side_panel?.default_path).toBe('popup.html');
  });

  it('商品页入口打开同一抽屉，其他页面回退到原生侧边栏', async () => {
    const setPanelBehavior = vi.fn(async () => undefined);
    const sendMessage = vi.fn(async () => true);
    const openPanel = vi.fn(async () => undefined);
    let actionClickHandler: ((tab: { id?: number; url?: string }) => void) | undefined;
    vi.stubGlobal('chrome', {
      runtime: { onMessage: { addListener: vi.fn() } },
      sidePanel: { setPanelBehavior, open: openPanel },
      action: { onClicked: { addListener: (listener: typeof actionClickHandler) => { actionClickHandler = listener; } } },
      tabs: { sendMessage },
    });
    await import('../src/background');
    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: false });
    actionClickHandler?.({ id: 7, url: 'https://www.emag.ro/test/pd/ABC123/' });
    expect(sendMessage).toHaveBeenCalledWith(7, { type: 'OPEN_TOOLKIT_DRAWER' });
    actionClickHandler?.({ id: 8, url: 'https://example.com/' });
    expect(openPanel).toHaveBeenCalledWith({ tabId: 8 });
  });

  it('隐私入口只接受本扩展来源并始终打开固定说明页', async () => {
    const create = vi.fn(async () => ({}));
    let handleMessage: ((message: unknown, sender: chrome.runtime.MessageSender, respond: (value: unknown) => void) => unknown) | undefined;
    vi.stubGlobal('chrome', {
      runtime: { id: 'test-extension', getURL: (name: string) => 'chrome-extension://test-extension/' + name.replace(/^\//, ''),
        onMessage: { addListener: (listener: typeof handleMessage) => { handleMessage = listener; } } },
      sidePanel: { setPanelBehavior: vi.fn(async () => undefined) },
      action: { onClicked: { addListener: vi.fn() } }, tabs: { create },
    });
    await import('../src/background');
    const respond = vi.fn();
    const message = { type: 'OPEN_PRIVACY_PAGE', url: 'https://untrusted.example/' };
    expect(handleMessage?.(message, { id: 'test-extension', url: 'https://www.emag.ro/product/pd/ABC/' }, respond)).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true }));
    expect(create).toHaveBeenCalledWith({ url: 'chrome-extension://test-extension/privacy.html' });
    create.mockClear();
    for (const sender of [
      { id: 'other-extension', url: 'https://www.emag.ro/product/pd/ABC/' },
      { id: 'test-extension', url: 'https://www.emag.ro.untrusted.example/' },
    ]) handleMessage?.(message, sender, respond);
    expect(create).not.toHaveBeenCalled();
  });
});
