import type { ProductNameSource, ProductSnapshot } from '../types';
import { containsChinese } from './productNameSource';

const supportedHosts = new Set(['www.emag.ro', 'detail.1688.com', 'www.1688.com']);

function titleFromPage(): string {
  return document.querySelector('h1')?.textContent?.trim() || document.title.trim();
}

function titleFrom1688Offer(): string {
  // 1688 商品页的首个 h1 可能是店铺名，标签页标题使用「商品名 - 阿里巴巴」格式。
  return document.title.trim().match(/^(.+)\s+-\s+阿里巴巴$/)?.[1].trim() ?? '';
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
  if (tab?.id === undefined) throw new Error('未找到当前商品标签页。');
  if (!tab.url) throw new Error('请先打开商品详情页。如果已在详情页，请点击浏览器工具栏的 eMAG 卖家工具箱图标后重试。');

  let page: URL;
  try { page = new URL(tab.url); }
  catch { throw new Error('请在 eMAG 或 1688 商品页打开插件后导入。'); }
  const isEmag = page.hostname === 'www.emag.ro';
  if (!supportedHosts.has(page.hostname) || (!isEmag && !/^\/offer\/\d+\.html$/.test(page.pathname))) {
    throw new Error('请在 eMAG 或 1688 商品页打开插件后导入。');
  }

  if (isEmag) {
    try {
      const snapshot = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PRODUCT_SNAPSHOT' }) as ProductSnapshot | null;
      if (snapshot?.title?.trim()) return importedName(snapshot.title.trim(), tab.url);
    } catch { /* 页面未注入或暂未解析时，继续读取当前标题。 */ }
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: isEmag ? titleFromPage : titleFrom1688Offer,
  });
  const title = typeof result?.result === 'string' ? result.result.trim() : '';
  if (!title) throw new Error('当前商品页面没有可导入的标题。');
  return importedName(title, tab.url);
}
