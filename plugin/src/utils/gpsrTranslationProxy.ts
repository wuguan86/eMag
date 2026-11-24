import { normalizeGpsrApiOrigin } from '../config/gpsrApi';
import { asRecord, isGpsrApiToken, productTitleLimit, readLabelName, readTranslatedNames, type GpsrNameResponse } from './gpsrNameProtocol';
import { containsChinese, isProductNameLanguage } from './productNameSource';

interface GpsrServiceOptions {
  origin: string;
  request: typeof fetch;
  readToken: (key: string) => Promise<unknown>;
  writeToken: (key: string, token: string) => Promise<void>;
}

const tokenKey = (origin: string) => `emag:gpsr-api-token:${origin}`;
const fail = (error: string): GpsrNameResponse => ({ ok: false, error });

const serviceOptions: GpsrServiceOptions = {
  origin: normalizeGpsrApiOrigin(import.meta.env.VITE_GPSR_API_ORIGIN),
  request: (input, options) => fetch(input, options),
  readToken: async (key) => (await chrome.storage.local.get(key))[key],
  writeToken: (key, token) => chrome.storage.local.set({ [key]: token }),
};

const serviceErrors: Record<number, string> = {
  401: '服务访问令牌无效，请在品名服务设置中更新。',
  422: '品名或原文语言无效，请检查后重试。',
  429: '品名服务请求过于频繁，请稍后重试。',
  504: '品名服务响应超时，请稍后重试。',
};

export async function handleGpsrNameRequest(message: unknown, options = serviceOptions): Promise<GpsrNameResponse> {
  const candidate = asRecord(message);
  const type = candidate?.type;
  const key = tokenKey(options.origin);
  const configError = '此版本尚未配置品名服务地址，请使用配置后的插件。';

  if (type === 'SET_GPSR_API_TOKEN') {
    if (!options.origin) return fail(configError);
    if (!isGpsrApiToken(candidate?.token)) return fail('服务访问令牌格式无效，请核对后重试。');
    try {
      await options.writeToken(key, candidate.token);
      return { ok: true, data: null };
    } catch { return fail('无法保存服务访问令牌，请重试。'); }
  }

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
    const token = await options.readToken(key);
    if (!isGpsrApiToken(token)) return fail('请在品名服务设置中填写服务访问令牌。');
    const route = refining ? 'refine' : 'translate';
    const response = await options.request(new URL(`/api/v1/gpsr/names/${route}`, options.origin), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
