import { afterEach, describe, expect, it, vi } from 'vitest';
import { translateProductName } from '../src/utils/gpsrTranslation';
import { handleGpsrTranslationRequest } from '../src/utils/gpsrTranslationProxy';

afterEach(() => vi.unstubAllGlobals());

describe('GPSR 品名翻译', () => {
  it('只向免费翻译服务发送用户输入的中文品名并返回三种语言', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const target = url.searchParams.get('langpair')?.split('|')[1];
      const translations: Record<string, string> = { ro: 'Căști Bluetooth', bg: 'Bluetooth слушалки', hu: 'Bluetooth fülhallgató' };
      return Response.json({ responseStatus: 200, responseData: { translatedText: translations[target ?? ''] } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(translateProductName('蓝牙耳机')).resolves.toEqual({ zh: '蓝牙耳机', ro: 'Căști Bluetooth', bg: 'Bluetooth слушалки', hu: 'Bluetooth fülhallgató' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([input]) => new URL(String(input)).searchParams.get('q') === '蓝牙耳机')).toBe(true);
  });

  it('罗马尼亚语原文复用 RO 并按真实源语言生成中文、BG 和 HU', async () => {
    const pairs: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const pair = url.searchParams.get('langpair') ?? '';
      pairs.push(pair);
      const translations: Record<string, string> = { 'ro|zh-CN': '女士滑雪服', 'ro|bg': 'Дамски ски костюм', 'ro|hu': 'Női síruha' };
      return Response.json({ responseStatus: 200, responseData: { translatedText: translations[pair] } });
    });
    await expect(translateProductName('Salopeta de schi femei', 'ro')).resolves.toEqual({
      zh: '女士滑雪服', ro: 'Salopeta de schi femei', bg: 'Дамски ски костюм', hu: 'Női síruha',
    });
    expect(pairs.sort()).toEqual(['ro|bg', 'ro|hu', 'ro|zh-CN']);
  });

  it('通过扩展后台传递明确源语言并返回中文译名', async () => {
    vi.stubGlobal('chrome', { runtime: { sendMessage: async (message: unknown) =>
      handleGpsrTranslationRequest(message, async (input) => {
        const pair = new URL(String(input)).searchParams.get('langpair');
        const translations: Record<string, string> = { 'en|zh-CN': '蓝牙耳机', 'en|ro': 'Căști', 'en|bg': 'Слушалки', 'en|hu': 'Fülhallgató' };
        return Response.json({ responseStatus: 200, responseData: { translatedText: translations[pair ?? ''] } });
      }) } });
    await expect(translateProductName('Wireless Earbuds', 'en')).resolves.toEqual({ zh: '蓝牙耳机', ro: 'Căști', bg: 'Слушалки', hu: 'Fülhallgató' });
  });

  it('未选语言或中文源语言与纯外文不符时不发送翻译请求', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(translateProductName('Salopeta', '')).rejects.toThrow('原文语言');
    await expect(translateProductName('Salopeta', 'zh-CN')).rejects.toThrow('原文语言');
    expect(request).not.toHaveBeenCalled();
  });

  it('代理拒绝未知源语言与源目标相同的请求', async () => {
    const request = vi.fn();
    for (const source of ['auto', 'de', 'ro']) {
      await expect(handleGpsrTranslationRequest({ type: 'TRANSLATE_GPSR_NAME', name: 'Salopeta', source, target: 'ro' }, request))
        .resolves.toEqual({ ok: false, error: '翻译请求格式无效。' });
    }
    expect(request).not.toHaveBeenCalled();
  });

  it('翻译服务失败时保留明确错误以便界面提示重试', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ responseStatus: 403, responseDetails: 'quota exceeded' })));
    await expect(translateProductName('蓝牙耳机')).rejects.toThrow('翻译服务暂不可用');
  });

  it('翻译代理只接受支持的目标语言和受限长度的中文品名', async () => {
    const request = vi.fn();
    await expect(handleGpsrTranslationRequest({ type: 'TRANSLATE_GPSR_NAME', name: '蓝牙耳机', target: 'en' }, request))
      .resolves.toEqual({ ok: false, error: '翻译请求格式无效。' });
    await expect(handleGpsrTranslationRequest({ type: 'TRANSLATE_GPSR_NAME', name: '品名'.repeat(81), target: 'ro' }, request))
      .resolves.toEqual({ ok: false, error: '翻译请求格式无效。' });
    expect(request).not.toHaveBeenCalled();
  });
});
