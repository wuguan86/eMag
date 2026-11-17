import { previewFontFamilies } from './fonts';
import type { FontAssets } from './text';

const registrationByDocument = new WeakMap<Document, Promise<void>>();

function decodeFontBuffer(base64: string): ArrayBuffer {
  const decoded = atob(base64);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
  return bytes.buffer;
}

// Shadow DOM 内的 @font-face 不会注册到文档；二进制字体不依赖 URL，也不受 data: 字体策略影响。
export function registerPreviewFonts(assets: FontAssets, targetDocument: Document = document): Promise<void> {
  // Node/jsdom 仅验证排版时没有字体 API，真实浏览器渲染在组件路径中单独等待字体。
  if (typeof FontFace === 'undefined' || !targetDocument.fonts) return Promise.resolve();
  const existing = registrationByDocument.get(targetDocument);
  if (existing) return existing;
  const registration = (async () => {
    const faces = [
      new FontFace(previewFontFamilies.NotoSans, decodeFontBuffer(assets.latin.base64)),
      new FontFace(previewFontFamilies.DroidFallback, decodeFontBuffer(assets.cjk.base64)),
    ];
    const loadedFaces = await Promise.all(faces.map((face) => face.load()));
    for (const face of loadedFaces) targetDocument.fonts.add(face);
  })();
  registrationByDocument.set(targetDocument, registration);
  void registration.catch(() => { registrationByDocument.delete(targetDocument); });
  return registration;
}
