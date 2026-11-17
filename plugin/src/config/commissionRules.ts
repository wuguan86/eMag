import { normalizeReference } from '../utils/productMetadata';

// 常见类目的试算参考值，不代表卖家合同费率；维护关键字时优先补充具体子类目。
export const commissionRules = [
  { category: '手机', rate: 0.10, keywords: ['telefoane mobile', 'smartphone', 'mobile phones', '手机'] },
  { category: '电子数码', rate: 0.12, keywords: ['electronice', 'electronics', 'laptop', 'tablete', 'calculatoare', 'televizoare', '数码'] },
  { category: '时尚鞋服', rate: 0.17, keywords: ['fashion', 'incaltaminte', 'ghete', 'pantofi', 'imbracaminte', 'hanorace', 'textile', '鞋服'] },
  { category: '家居园艺', rate: 0.14, keywords: ['casa', 'gradina', 'mobilier', 'home', 'garden', '家居', '园艺'] },
  { category: '美妆个护', rate: 0.16, keywords: ['frumusete', 'ingrijire', 'cosmetice', 'beauty', '美妆', '个护'] },
] as const;

export function matchCommission(breadcrumbs: readonly string[] | null) {
  for (const segment of [...(breadcrumbs ?? [])].reverse()) {
    const normalized = normalizeReference(segment);
    const rule = commissionRules.find((entry) => entry.keywords.some((keyword) => normalized.includes(keyword)));
    if (rule) return { rate: rule.rate, category: rule.category };
  }
  return { rate: 0.16, category: null };
}

export const marketVatRates = { RO: 0.21, HU: 0.27, BG: 0.20 } as const;
