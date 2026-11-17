import type { ProductNameSource, ProductSnapshot } from '../types';
import { containsChinese } from './productNameSource';

const supportedHosts = new Set(['www.emag.ro', 'detail.1688.com', 'www.1688.com']);

function titleFromPage(): string {
  return document.querySelector('h1')?.textContent?.trim() || document.title.trim();
}

function importedName(text: string, url: string): ProductNameSource {
  let isEmag = false;
  try { isEmag = new URL(url).hostname === 'www.emag.ro'; } catch { /* 无有效来源地址时由用户确认语言。 */ }
  return { text, language: containsChinese(text) ? 'zh-CN' : isEmag ? 'ro' : '' };
}

export async function readCurrentProductName(product: ProductSnapshot | null): Promise<ProductNameSource> {
  if (product?.title?.trim()) return importedName(product.title.trim(), product.url);
  if (!globalThis.chrome?.tabs || !globalThis.chrome.scripting) throw new Error('请在 eMAG 或 1688 商品页打开插件后导入。');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url) throw new Error('未找到当前商品标签页。');

  let host: string;
  try { host = new URL(tab.url).hostname; }
  catch { throw new Error('请在 eMAG 或 1688 商品页打开插件后导入。'); }
  if (!supportedHosts.has(host)) throw new Error('请在 eMAG 或 1688 商品页打开插件后导入。');

  if (host === 'www.emag.ro') {
    try {
      const snapshot = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PRODUCT_SNAPSHOT' }) as ProductSnapshot | null;
      if (snapshot?.title?.trim()) return importedName(snapshot.title.trim(), tab.url);
    } catch { /* 页面未注入或暂未解析时，继续读取当前标题。 */ }
  }

  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: titleFromPage });
  const title = typeof result?.result === 'string' ? result.result.trim() : '';
  if (!title) throw new Error('当前商品页面没有可导入的标题。');
  return importedName(title, tab.url);
}
