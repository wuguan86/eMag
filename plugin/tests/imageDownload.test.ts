import { describe, expect, it, vi } from 'vitest';
import { fetchJpegImage } from '../src/utils/imageDownload';

describe('1688兼容图片获取', () => {
  it('请求JPEG变体并保留已由CDN返回的JPEG', async () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const requests: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push([input, init]);
      return new Response(new Blob([jpegBytes], { type: 'image/jpeg' }), { headers: { 'Content-Type': 'image/jpeg' } });
    });

    const result = await fetchJpegImage('https://images.example/item.jpg', request);

    expect(request).toHaveBeenCalledTimes(1);
    expect(requests[0][1]).toMatchObject({ mode: 'cors', credentials: 'omit', headers: { Accept: 'image/jpeg' } });
    expect(result.type).toBe('image/jpeg');
    expect(result.size).toBeGreaterThan(0);
  });

  it.each(['data:image/jpeg;base64,/9j/2Q==', 'javascript:alert(1)', 'https://user:pass@images.example/item.jpg'])('拒绝非安全图片地址 %s', async (url) => {
    const request = vi.fn();
    await expect(fetchJpegImage(url, request)).rejects.toThrow('不支持的图片地址');
    expect(request).not.toHaveBeenCalled();
  });

  it('服务器拒绝或找不到图片时给出中文错误', async () => {
    const request = vi.fn(async () => new Response('missing', { status: 404 }));
    await expect(fetchJpegImage('https://images.example/item.jpg', request)).rejects.toThrow('图片下载失败');
  });
});
