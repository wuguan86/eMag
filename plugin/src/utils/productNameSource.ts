import type { GpsrLabelDraft, LocalizedText, ProductNameLanguage, ProductNameSource } from '../types';

export const productNameLanguages: { value: ProductNameLanguage; label: string }[] = [
  { value: 'zh-CN', label: '中文' }, { value: 'ro', label: '罗马尼亚语' },
  { value: 'bg', label: '保加利亚语' }, { value: 'hu', label: '匈牙利语' }, { value: 'en', label: '英语' },
];

export const containsChinese = (text: string) => /[\u3400-\u9fff\uf900-\ufaff]/.test(text);
export const isProductNameLanguage = (value: unknown): value is ProductNameLanguage =>
  productNameLanguages.some((language) => language.value === value);

export function namesFromSource(source: ProductNameSource): LocalizedText {
  const names: LocalizedText = { zh: '', ro: '', bg: '', hu: '' };
  if (source.language === 'zh-CN' && !containsChinese(source.text)) return names;
  if (source.language && source.language !== 'en') names[source.language === 'zh-CN' ? 'zh' : source.language] = source.text;
  return names;
}

export function normalizeProductNameSource(draft: GpsrLabelDraft): GpsrLabelDraft & { productNameSource: ProductNameSource } {
  if (draft.productNameSource) return { ...draft, productNameSource: draft.productNameSource };
  const text = draft.productName.zh;
  const language = !text.trim() || containsChinese(text) ? 'zh-CN' : '';
  const source: ProductNameSource = { text, language };
  // 旧版把外文标题放进中文字段，无法证明现有译文属于该标题；保留原文并等待用户确认语言。
  return { ...draft, productNameSource: source, productName: language ? draft.productName : namesFromSource(source) };
}
