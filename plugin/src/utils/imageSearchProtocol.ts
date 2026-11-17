export const imageSearchPageUrl = 'https://air.1688.com/kapp/1688-search/pc-image-search/?tab=imageSearch';
const imageJobPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildImageSearchUrl(jobId: string): string {
  if (!imageJobPattern.test(jobId)) throw new Error('图搜任务编号无效。');
  return `${imageSearchPageUrl}#emag-image-search=${jobId}`;
}

export function readImageSearchJobId(hash: string): string | null {
  const match = /^#emag-image-search=(.+)$/.exec(hash);
  return match && imageJobPattern.test(match[1]) ? match[1] : null;
}

export async function blobToBase64(blob: Blob, maxBytes = 5 * 1024 * 1024): Promise<string> {
  if (blob.size === 0 || blob.size > maxBytes) throw new Error('图片超过自动图搜大小限制，请手动上传下载的 JPEG。');
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (reader.result instanceof ArrayBuffer) resolve(new Uint8Array(reader.result));
      else reject(new Error('无法读取图片数据。'));
    }, { once: true });
    reader.addEventListener('error', () => reject(new Error('读取图片数据失败。')), { once: true });
    reader.readAsArrayBuffer(blob);
  });
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
