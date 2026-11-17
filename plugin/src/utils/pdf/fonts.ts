import type { jsPDF } from 'jspdf';

export type PdfFont = 'NotoSans' | 'DroidFallback';
export const previewFontFamilies: Record<PdfFont, string> = {
  NotoSans: 'EmagToolkitNotoSans', DroidFallback: 'EmagToolkitDroidFallback',
};
type FontAsset = { base64: string; ranges: readonly (readonly [number, number])[] };
let assetsPromise: Promise<{ latin: FontAsset; cjk: FontAsset }> | undefined;

// 内联资源按需加载，内容脚本不会向商家网站或远程字体站点发请求。
export function loadFontAssets() {
  assetsPromise ??= Promise.all([import('../../assets/fonts/latin'), import('../../assets/fonts/cjk')])
    .then(([latin, cjk]) => ({ latin, cjk }));
  return assetsPromise;
}

export async function installFonts(doc: jsPDF) {
  const assets = await loadFontAssets();
  for (const [filename, family, asset] of [
    ['NotoSans-Regular.ttf', 'NotoSans', assets.latin],
    ['DroidSansFallback.ttf', 'DroidFallback', assets.cjk],
  ] as const) {
    doc.addFileToVFS(filename, asset.base64);
    doc.addFont(filename, family, 'normal');
    doc.addFont(filename, family, 'bold');
  }
  doc.setFont('NotoSans');
  return assets;
}

export function fontForCharacter(character: string, assets: Awaited<ReturnType<typeof loadFontAssets>>): PdfFont | null {
  const code = character.codePointAt(0)!;
  if (code < 32 || code > 65535) return null;
  const supported = (asset: FontAsset) => asset.ranges.some(([start, end]) => code >= start && code <= end);
  return supported(assets.latin) ? 'NotoSans' : supported(assets.cjk) ? 'DroidFallback' : null;
}

