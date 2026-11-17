import { createRoot, type Root } from 'react-dom/client';
import type { ProductSnapshot } from '../types';
import { isProductUrl, parseProduct } from '../utils/productParser';
import { Drawer } from './Drawer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ProductFreshness } from './productFreshness';
import { ProductParseReporter } from './productParseReporter';
import { OPEN_TOOLKIT_DRAWER_EVENT } from './events';

export const hostId = 'emag-seller-toolkit-root';

export function startProductObserver(stylesheet: string) {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  let snapshot: ProductSnapshot | null = null;
  let openOnNextRender = false;
  let lastUrl = '';
  let fingerprint = '';
  const freshness = new ProductFreshness();
  const reporter = new ProductParseReporter();
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const warnings = new Set<string>();
  const unmount = () => {
    root?.unmount(); host?.remove(); root = null; host = null; snapshot = null; fingerprint = ''; freshness.reset(); reporter.reset();
  };
  const parseCurrent = () => {
    const url = location.href;
    if (!isProductUrl(url)) { unmount(); lastUrl = url; return; }
    const changedProduct = lastUrl !== url;
    if (changedProduct) { snapshot = null; fingerprint = ''; warnings.clear(); reporter.reset(); }
    lastUrl = url;
    try {
      snapshot = freshness.accept(parseProduct(document, url), document);
      reporter.update(snapshot);
      const currentFingerprint = JSON.stringify({ ...snapshot, capturedAt: 0 });
      if (currentFingerprint === fingerprint && host?.isConnected) return;
      fingerprint = currentFingerprint;
      if (!host?.isConnected) {
        root?.unmount();
        // 原站中只插入一个宿主；所有界面和样式均位于隔离层内部。
        host = document.createElement('div'); host.id = hostId;
        const shadow = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style'); style.textContent = stylesheet;
        const container = document.createElement('div');
        shadow.append(style, container); document.documentElement.append(host);
        root = createRoot(container);
      }
      root?.render(<ErrorBoundary><Drawer product={snapshot} openOnMount={openOnNextRender}/></ErrorBoundary>);
    } catch (error) {
      reporter.reset();
      if (!warnings.has('exception')) { warnings.add('exception'); console.warn('商品读取异常，稍后将自动重试。', error); }
    }
  };
  const schedule = () => { if (debounce) clearTimeout(debounce); debounce = setTimeout(parseCurrent, 300); };
  const observer = new MutationObserver((records) => {
    // Shadow DOM 内部变更不会被此观察器接收；宿主自身插入无需触发重复解析。
    if (records.some((record) => record.target !== document.documentElement || [...record.addedNodes].some((node) => node !== host))) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['src', 'srcset', 'data-src', 'data-srcset', 'data-zoom-image', 'data-large-image', 'data-original', 'href', 'content', 'data-price', 'data-current-price', 'alt', 'data-brand-name', 'hidden', 'aria-hidden'] });
  const interval = setInterval(() => { if (!document.hidden && location.href !== lastUrl) parseCurrent(); }, 1000);
  window.addEventListener('popstate', parseCurrent);
  window.addEventListener('pageshow', parseCurrent);
  const messageListener = (message: unknown, _sender: chrome.runtime.MessageSender, respond: (value: unknown) => void) => {
    if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'GET_PRODUCT_SNAPSHOT') {
      if (isProductUrl(location.href)) parseCurrent();
      respond(isProductUrl(location.href) ? snapshot : null);
      return;
    }
    if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'OPEN_TOOLKIT_DRAWER') {
      if (!isProductUrl(location.href)) { respond(false); return; }
      openOnNextRender = true;
      parseCurrent();
      window.dispatchEvent(new Event(OPEN_TOOLKIT_DRAWER_EVENT));
      openOnNextRender = false;
      respond(true);
    }
  };
  globalThis.chrome?.runtime?.onMessage?.addListener(messageListener);
  parseCurrent();
  return () => {
    observer.disconnect(); clearInterval(interval); if (debounce) clearTimeout(debounce);
    window.removeEventListener('popstate', parseCurrent); window.removeEventListener('pageshow', parseCurrent);
    globalThis.chrome?.runtime?.onMessage?.removeListener(messageListener); unmount();
  };
}
