import type { LocalizedText, ProductNameLanguage } from '../types';
import { containsChinese } from './productNameSource';

export const productTitleLimit = 2000;
export const labelNameLimit = 160;
export const translationKeys = ['zh', 'ro', 'bg', 'hu'] as const;

export type GpsrNameRequest =
  | { type: 'REFINE_GPSR_NAME'; name: string; sourceLanguage: ProductNameLanguage | null }
  | { type: 'TRANSLATE_GPSR_NAME'; name: string; sourceLanguage: ProductNameLanguage };

export type GpsrNameResponse =
  | { ok: true; data: { name: string } | LocalizedText | null }
  | { ok: false; error: string };

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function readLabelName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name && name.length <= labelNameLimit && !/[\r\n]/.test(name) ? name : null;
}

export function readTranslatedNames(value: unknown): LocalizedText | null {
  const result = asRecord(value);
  const zh = readLabelName(result?.zh);
  const ro = readLabelName(result?.ro);
  const bg = readLabelName(result?.bg);
  const hu = readLabelName(result?.hu);
  return zh && containsChinese(zh) && ro && bg && hu ? { zh, ro, bg, hu } : null;
}
