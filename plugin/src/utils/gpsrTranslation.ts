import type { LocalizedText, ProductNameLanguage } from '../types';
import { asRecord, labelNameLimit, productTitleLimit, readLabelName, readTranslatedNames, type GpsrNameRequest } from './gpsrNameProtocol';
import { containsChinese, isProductNameLanguage } from './productNameSource';

async function requestNameService(request: GpsrNameRequest): Promise<unknown> {
  if (!globalThis.chrome?.runtime?.sendMessage) throw new Error('请在已加载的扩展中使用品名服务。');
  let response: Record<string, unknown> | null;
  try { response = asRecord(await chrome.runtime.sendMessage(request)); }
  catch { throw new Error('无法连接扩展后台，请重新加载扩展或商品页后重试。'); }
  if (response?.ok !== true) {
    throw new Error(typeof response?.error === 'string' ? response.error : '品名服务暂不可用，请稍后重试。');
  }
  return response.data;
}

export async function refineProductName(name: string, source: ProductNameLanguage | ''): Promise<string> {
  const normalized = name.trim();
  if (!normalized) throw new Error('请先填写商品原始品名。');
  if (normalized.length > productTitleLimit) throw new Error(`商品原始品名超过 ${productTitleLimit} 字符，请编辑原文或手填短品名。`);
  const data = await requestNameService({ type: 'REFINE_GPSR_NAME', name: normalized, sourceLanguage: source || null });
  const refined = readLabelName(asRecord(data)?.name);
  if (!refined) throw new Error('提炼结果格式无效，请重试。');
  return refined;
}

export async function translateProductName(name: string, source: ProductNameLanguage | ''): Promise<LocalizedText> {
  const normalized = name.trim();
  if (!normalized) throw new Error('请先填写商品原始品名或短品名。');
  if (normalized.length > labelNameLimit) throw new Error(`待翻译品名超过 ${labelNameLimit} 字符，请先填写短品名。`);
  if (!readLabelName(normalized)) throw new Error('请先填写单行短品名。');
  if (!isProductNameLanguage(source) || (source === 'zh-CN' && !containsChinese(normalized))) {
    throw new Error('请确认并选择正确的原文语言。');
  }
  const data = await requestNameService({ type: 'TRANSLATE_GPSR_NAME', name: normalized, sourceLanguage: source });
  const names = readTranslatedNames(data);
  if (!names) throw new Error('翻译结果格式无效，请重试。');
  return names;
}
