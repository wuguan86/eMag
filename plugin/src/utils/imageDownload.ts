export async function fetchJpegImage(imageUrl: string, request: typeof fetch = fetch): Promise<Blob> {
  let source: URL;
  try { source = new URL(imageUrl); }
  catch { throw new Error('不支持的图片地址'); }
  if (!/^https?:$/.test(source.protocol) || source.username || source.password) throw new Error('不支持的图片地址');

  let response: Response;
  try {
    response = await request(source.href, {
      mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'image/jpeg' },
    });
  } catch { throw new Error('图片下载失败，请检查网络或图片站点限制。'); }
  if (!response.ok) throw new Error(`图片下载失败（HTTP ${response.status}）。`);
  const image = await response.blob();
  if (!image.type.startsWith('image/')) throw new Error('服务器返回的内容不是图片。');
  if (image.type === 'image/jpeg') return image;

  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(image); }
  catch { throw new Error('浏览器无法解码这张图片，请在页面中确认图片能正常显示。'); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 64_000_000) throw new Error('图片尺寸无效或过大。');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建图片转换画布。');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const jpeg = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('JPEG转换失败。')), 'image/jpeg', 0.92);
    });
    if (jpeg.type !== 'image/jpeg') throw new Error('浏览器未能生成JPEG图片。');
    return jpeg;
  } finally { bitmap.close(); }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName.toLowerCase().endsWith('.jpg') ? fileName : `${fileName}.jpg`;
  link.hidden = true;
  document.body.append(link);
  try { link.click(); }
  finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  }
}

export async function downloadJpegImage(imageUrl: string, fileName: string): Promise<void> {
  downloadBlob(await fetchJpegImage(imageUrl), fileName);
}
