import { normalizeGpsrApiOrigin } from '../config/gpsrApi';
import { asRecord, productTitleLimit, readLabelName, readTranslatedNames, type GpsrNameResponse } from './gpsrNameProtocol';
import { containsChinese, isProductNameLanguage } from './productNameSource';

interface GpsrServiceOptions {
  origin: string;
  request: typeof fetch;
}

const fail = (error: string): GpsrNameResponse => ({ ok: false, error });

const serviceOptions: GpsrServiceOptions = {
  origin: normalizeGpsrApiOrigin(import.meta.env.VITE_GPSR_API_ORIGIN),
  request: (input, options) => fetch(input, options),
};

const serviceErrors: Record<number, string> = {
  422: '品名或原文语言无效，请检查后重试。',
  429: '品名服务请求过于频繁，请稍后重试。',
  504: '品名服务响应超时，请稍后重试。',
};

export async function handleGpsrNameRequest(message: unknown, options = serviceOptions): Promise<GpsrNameResponse> {
  const candidate = asRecord(message);
  const type = candidate?.type;
  const configError = '此版本尚未配置品名服务地址，请使用配置后的插件。';

  if (type !== 'REFINE_GPSR_NAME' && type !== 'TRANSLATE_GPSR_NAME') return fail('品名请求格式无效。');
  const refining = type === 'REFINE_GPSR_NAME';
  const name = typeof candidate?.name === 'string' ? candidate.name.trim() : '';
  const sourceLanguage = candidate?.sourceLanguage;
  if (!name || (refining ? name.length > productTitleLimit : !readLabelName(name))
    || (!isProductNameLanguage(sourceLanguage) && !(refining && sourceLanguage === null))
    || (!refining && sourceLanguage === 'zh-CN' && !containsChinese(name))) return fail('品名请求格式无效。');
  if (!options.origin) return fail(configError);

  const unavailable = `${refining ? '提炼' : '翻译'}服务暂不可用，请稍后重试。`;
  try {
    const route = refining ? 'refine' : 'translate';
    const response = await options.request(new URL(`/api/v1/gpsr/names/${route}`, options.origin), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sourceLanguage }), signal: AbortSignal.timeout(20_000),
      credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
    });
    if (!response.ok) return fail(serviceErrors[response.status] ?? unavailable);
    const body: unknown = await response.json();
    const data = refining ? readLabelName(asRecord(body)?.name) : readTranslatedNames(body);
    if (!data) return fail(`${refining ? '提炼' : '翻译'}结果格式无效，请重试。`);
    return { ok: true, data: typeof data === 'string' ? { name: data } : data };
  } catch (error) {
    return fail(error instanceof DOMException && error.name === 'TimeoutError' ? serviceErrors[504] : unavailable);
  }
}
