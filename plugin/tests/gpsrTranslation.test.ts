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

    await expect(translateProductName('蓝牙耳机')).resolves.toEqual({ ro: 'Căști Bluetooth', bg: 'Bluetooth слушалки', hu: 'Bluetooth fülhallgató' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([input]) => new URL(String(input)).searchParams.get('q') === '蓝牙耳机')).toBe(true);
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
