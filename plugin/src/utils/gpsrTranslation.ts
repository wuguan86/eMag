import type { LocalizedText, ProductNameLanguage } from '../types';
import { containsChinese, isProductNameLanguage } from './productNameSource';

const targets = ['zh-CN', 'ro', 'bg', 'hu'] as const;
async function translateToLanguage(name: string, source: ProductNameLanguage, target: typeof targets[number]): Promise<string> {
  if (source === target) return name;
  if (globalThis.chrome?.runtime) {
    const response = await chrome.runtime.sendMessage({ type: 'TRANSLATE_GPSR_NAME', name, source, target }) as { ok?: boolean; text?: string; error?: string };
    if (!response?.ok || !response.text) throw new Error(response?.error ?? '翻译服务暂不可用，请稍后重试。');
    return response.text;
  }
  const { handleGpsrTranslationRequest } = await import('./gpsrTranslationProxy');
  const response = await handleGpsrTranslationRequest({ type: 'TRANSLATE_GPSR_NAME', name, source, target });
  if (!response.ok) throw new Error(response.error);
  return response.text;
}

export async function translateProductName(name: string, source: ProductNameLanguage | '' = 'zh-CN'): Promise<LocalizedText> {
  const normalized = name.trim();
  if (!normalized) throw new Error('请先填写商品原始品名。');
  if (normalized.length > 160) throw new Error('商品原始品名不得超过 160 字符，请精简后重试。');
  if (!isProductNameLanguage(source) || (source === 'zh-CN' && !containsChinese(normalized))) {
    throw new Error('请确认并选择正确的原文语言。');
  }
  const [zh, ro, bg, hu] = await Promise.all(targets.map((target) => translateToLanguage(normalized, source, target)));
  return { zh, ro, bg, hu };
}
