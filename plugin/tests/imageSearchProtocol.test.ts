import { describe, expect, it } from 'vitest';
import { blobToBase64, buildImageSearchUrl, readImageSearchJobId } from '../src/utils/imageSearchProtocol';

describe('1688自动图搜消息协议', () => {
  it('只把有效任务编号加入受限的图片搜索页面地址', () => {
    const jobId = '123e4567-e89b-42d3-a456-426614174000';
    const url = new URL(buildImageSearchUrl(jobId));

    expect(url.origin).toBe('https://air.1688.com');
    expect(url.pathname).toBe('/kapp/1688-search/pc-image-search/');
    expect(url.searchParams.get('tab')).toBe('imageSearch');
    expect(readImageSearchJobId(url.hash)).toBe(jobId);
    expect(() => buildImageSearchUrl('javascript:alert(1)')).toThrow('任务编号无效');
  });

  it('拒绝无效任务片段和空或过大的图片', async () => {
    expect(readImageSearchJobId('#emag-image-search=not-a-uuid')).toBeNull();
    await expect(blobToBase64(new Blob([]))).rejects.toThrow('大小限制');
    await expect(blobToBase64(new Blob([new Uint8Array(5)]), 4)).rejects.toThrow('大小限制');
  });

  it('把图片字节编码为可跨扩展消息传递的 Base64', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
    const encoded = await blobToBase64(new Blob([bytes]));

    expect(atob(encoded)).toBe(String.fromCharCode(...bytes));
  });
});
