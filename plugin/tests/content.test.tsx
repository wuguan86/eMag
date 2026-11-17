import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('商品页内容脚本生命周期', () => {
  let cleanup: (() => void) | undefined;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    history.replaceState({}, '', '/test-product/pd/ABC123/');
    document.body.innerHTML = '<h1 class="page-title">测试商品</h1><div class="product-highlight"><p class="product-new-price">129<sup>99</sup> Lei</p></div>';
  });
  afterEach(async () => {
    await act(async () => { cleanup?.(); });
    vi.unstubAllGlobals();
  });

  it('界面和样式仅在Shadow DOM内，收起后焦点返回按钮', async () => {
    const { startProductObserver, hostId } = await import('../src/content/controller');
    await act(async () => { cleanup = startProductObserver('.toolkit { color: blue; }'); });
    const host = document.getElementById(hostId)!;
    expect(host.shadowRoot).not.toBeNull();
    expect(host.childElementCount).toBe(0);
    const shadow = host.shadowRoot!;
    expect(shadow.querySelector('style')?.textContent).toContain('.toolkit');
    const launcher = shadow.querySelector<HTMLButtonElement>('.launcher')!;
    await act(async () => { launcher.click(); });
    expect(launcher.getAttribute('aria-expanded')).toBe('true');
    const close = shadow.querySelector<HTMLButtonElement>('[aria-label="收起侧栏"]')!;
    await act(async () => { close.click(); });
    expect(launcher.getAttribute('aria-expanded')).toBe('false');
    expect(shadow.activeElement).toBe(launcher);
  });

  it('收到工具栏入口消息时打开同一个商品抽屉', async () => {
    let messageListener: ((message: unknown, sender: chrome.runtime.MessageSender, respond: (value: unknown) => void) => void) | undefined;
    vi.stubGlobal('chrome', { runtime: { onMessage: { addListener: (listener: typeof messageListener) => { messageListener = listener; }, removeListener: vi.fn() } } });
    const { startProductObserver, hostId } = await import('../src/content/controller');
    await act(async () => { cleanup = startProductObserver('.toolkit { color: blue; }'); });
    await act(async () => { messageListener?.({ type: 'OPEN_TOOLKIT_DRAWER' }, {} as chrome.runtime.MessageSender, vi.fn()); });
    const shadow = document.getElementById(hostId)!.shadowRoot!;
    expect(shadow.querySelector('.drawer')?.classList.contains('open')).toBe(true);
    expect(shadow.querySelector('.launcher')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('离开商品路径时卸载浮窗', async () => {
    const { startProductObserver, hostId } = await import('../src/content/controller');
    await act(async () => { cleanup = startProductObserver(''); });
    expect(document.getElementById(hostId)).not.toBeNull();
    await act(async () => { history.replaceState({}, '', '/search/test'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(document.getElementById(hostId)).toBeNull();
  });

  it('懒加载主图属性更新后自动替换缩略图', async () => {
    const { startProductObserver, hostId } = await import('../src/content/controller');
    document.body.insertAdjacentHTML('beforeend', '<div id="product-gallery"><img src="https://images.example/main.jpg?width=80"></div>');
    await act(async () => { cleanup = startProductObserver(''); });
    const shadow = document.getElementById(hostId)!.shadowRoot!;
    await act(async () => {
      document.querySelector('#product-gallery img')!.setAttribute('data-zoom-image', 'https://images.example/main.jpg?width=1600');
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(shadow.querySelector('.product-image')?.getAttribute('src')).toBe('https://images.example/main.jpg?width=1600');
  });

  it('页内切换商品会清除旧标题与旧利润面板', async () => {
    const { startProductObserver, hostId } = await import('../src/content/controller');
    await act(async () => { cleanup = startProductObserver(''); });
    const shadow = document.getElementById(hostId)!.shadowRoot!;
    expect(shadow.textContent).toContain('测试商品');
    await act(async () => {
      history.replaceState({}, '', '/next-product/pd/DEF456/');
      document.body.innerHTML = '<h1 class="page-title">新商品</h1>';
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(shadow.textContent).toContain('新商品');
    expect(shadow.textContent).not.toContain('测试商品');
  });

  it('URL先切换而DOM尚未更新时不能继续展示旧商品数据', async () => {
    const { startProductObserver, hostId } = await import('../src/content/controller');
    await act(async () => { cleanup = startProductObserver(''); });
    const shadow = document.getElementById(hostId)!.shadowRoot!;
    await act(async () => { history.replaceState({}, '', '/next/pd/NEW999/'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(shadow.textContent).not.toContain('测试商品');
    expect(shadow.textContent).toContain('未读取到商品标题');
  });

  it('新商品只更新标题时不能继承旧价格，替换同价节点后可重新读取', async () => {
    const { startProductObserver, hostId } = await import('../src/content/controller');
    await act(async () => { cleanup = startProductObserver(''); });
    const shadow = document.getElementById(hostId)!.shadowRoot!;
    await act(async () => {
      history.replaceState({}, '', '/next/pd/NEXT888/');
      document.querySelector('h1')!.textContent = '第二个商品';
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(shadow.querySelector('.product-copy')?.textContent).toContain('第二个商品');
    expect(shadow.querySelector('.price')?.textContent).not.toContain('129.99');
    await act(async () => {
      document.querySelector('.product-new-price')!.outerHTML = '<p class="product-new-price">129<sup>99</sup> Lei</p>';
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(shadow.querySelector('.price')?.textContent).toContain('129.99');
  });
});
