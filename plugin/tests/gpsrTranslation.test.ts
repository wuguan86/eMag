import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeGpsrApiOrigin } from '../src/config/gpsrApi';
import { refineProductName, translateProductName } from '../src/utils/gpsrTranslation';
import { handleGpsrNameRequest } from '../src/utils/gpsrTranslationProxy';
import { readLabelName } from '../src/utils/gpsrNameProtocol';

const names = { zh: '女士滑雪服', ro: 'Salopetă de schi', bg: 'Дамски ски костюм', hu: 'Női síruha' };
const origin = 'https://gpsr.example.com';
const translation = { type: 'TRANSLATE_GPSR_NAME', name: names.ro, sourceLanguage: 'ro' };

function service(request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(names))) {
  return { origin, request };
}

afterEach(() => vi.unstubAllGlobals());

describe('GPSR 品名服务', () => {
  it('通过扩展后台发起单次翻译并获得完整结果', async () => {
    const options = service();
    const sendMessage = vi.fn((message: unknown) => handleGpsrNameRequest(message, options));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    await expect(translateProductName(` ${names.ro} `, 'ro')).resolves.toEqual(names);
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith(translation);
    expect(options.request).toHaveBeenCalledTimes(1);
    const [url, request] = options.request.mock.calls[0];
    expect(String(url)).toBe(`${origin}/api/v1/gpsr/names/translate`);
    expect(JSON.parse(String(request?.body))).toEqual({ name: names.ro, sourceLanguage: 'ro' });
    expect(request?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(request?.headers).not.toHaveProperty('Authorization');
    expect(request?.redirect).toBe('error');
  });

  it('无需令牌即可提炼完整标题', async () => {
    const options = service(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ name: '女士罗纹吊带背心' })));
    vi.stubGlobal('chrome', { runtime: { sendMessage: (message: unknown) => handleGpsrNameRequest(message, options) } });
    const title = '女士吊带背心，厂家直销'.repeat(20);
    await expect(refineProductName(title, '')).resolves.toBe('女士罗纹吊带背心');
    const [url, request] = options.request.mock.calls[0];
    expect(String(url)).toBe(`${origin}/api/v1/gpsr/names/refine`);
    expect(JSON.parse(String(request?.body))).toEqual({ name: title, sourceLanguage: null });
  });

  it('缺少语言或输入过长时避免发送请求', async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    await expect(translateProductName('Vest', '')).rejects.toThrow('原文语言');
    await expect(translateProductName('Vest', 'zh-CN')).rejects.toThrow('原文语言');
    await expect(translateProductName('衣'.repeat(161), 'zh-CN')).rejects.toThrow('短品名');
    await expect(refineProductName('衣'.repeat(2001), 'zh-CN')).rejects.toThrow('2000');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('扩展后台拒绝无效请求和缺少服务地址', async () => {
    const options = service();
    for (const request of [null, { ...translation, name: 'a'.repeat(161) }, { ...translation, sourceLanguage: 'de' }]) {
      await expect(handleGpsrNameRequest(request, options)).resolves.toMatchObject({ ok: false, error: '品名请求格式无效。' });
    }
    await expect(handleGpsrNameRequest(translation, { ...options, origin: '' })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('服务地址') });
    expect(options.request).not.toHaveBeenCalled();
  });

  it.each([[401, '暂不可用'], [429, '频繁'], [502, '暂不可用'], [504, '超时']])('将服务状态 %i 转换为用户提示', async (status, hint) => {
    const options = service(vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status })));
    await expect(handleGpsrNameRequest(translation, options)).resolves.toMatchObject({ ok: false, error: expect.stringContaining(hint) });
  });

  it('拒绝不完整译文', async () => {
    const options = service(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ zh: names.zh, ro: names.ro })));
    await expect(handleGpsrNameRequest(translation, options)).resolves.toMatchObject({ ok: false, error: expect.stringContaining('结果格式') });
  });

  it('只接受受信任协议的服务根地址', () => {
    expect(normalizeGpsrApiOrigin(' https://gpsr.example.com/ ')).toBe(origin);
    expect(normalizeGpsrApiOrigin('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000');
    expect(() => normalizeGpsrApiOrigin('http://gpsr.example.com')).toThrow();
    expect(() => normalizeGpsrApiOrigin('https://gpsr.example.com/api')).toThrow();
  });

  it('使用 Chrome 120 已支持的 URL 构造函数解析服务地址', () => {
    vi.spyOn(URL, 'parse').mockImplementation(() => { throw new Error('旧版浏览器无此方法'); });
    expect(normalizeGpsrApiOrigin(origin)).toBe(origin);
    expect(() => normalizeGpsrApiOrigin('invalid url')).toThrow('品名服务地址');
  });

  it('单行品名允许英文字母并拒绝内部换行', () => {
    expect(readLabelName('Wireless headphones')).toBe('Wireless headphones');
    expect(readLabelName(['商品', '品名'].join(String.fromCharCode(10)))).toBeNull();
  });
});
