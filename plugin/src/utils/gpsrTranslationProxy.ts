import type { ProductNameLanguage } from '../types';
import { isProductNameLanguage } from './productNameSource';

export type GpsrTranslationTarget = 'zh-CN' | 'ro' | 'bg' | 'hu';
export interface GpsrTranslationRequest { type: 'TRANSLATE_GPSR_NAME'; name: string; source: ProductNameLanguage; target: GpsrTranslationTarget }
export type GpsrTranslationResponse = { ok: true; text: string } | { ok: false; error: string };

const targets: readonly GpsrTranslationTarget[] = ['zh-CN', 'ro', 'bg', 'hu'];

export async function handleGpsrTranslationRequest(message: unknown, request: typeof fetch = fetch): Promise<GpsrTranslationResponse> {
  if (typeof message !== 'object' || message === null) return { ok: false, error: '翻译请求格式无效。' };
  const candidate = message as Partial<GpsrTranslationRequest>;
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  if (candidate.type !== 'TRANSLATE_GPSR_NAME' || !name || name.length > 160
    || !isProductNameLanguage(candidate.source) || candidate.source === candidate.target
    || !targets.includes(candidate.target as GpsrTranslationTarget)) return { ok: false, error: '翻译请求格式无效。' };

  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', name);
  url.searchParams.set('langpair', `${candidate.source}|${candidate.target}`);
  try {
    const response = await request(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return { ok: false, error: '翻译服务暂不可用，请稍后重试。' };
    const body = await response.json() as { responseStatus?: number; responseData?: { translatedText?: string } };
    const text = body.responseData?.translatedText?.trim();
    if (body.responseStatus !== 200 || !text || text.startsWith('[')) return { ok: false, error: '翻译服务暂不可用，请稍后重试。' };
    return { ok: true, text };
  } catch {
    return { ok: false, error: '翻译服务暂不可用，请稍后重试。' };
  }
}
