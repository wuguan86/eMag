import type { GpsrLabelData } from '../types';
import { gpsrLabelFileName } from './gpsrLabel';
import { downloadBlob } from './imageDownload';
import { createGpsrLabelLayout, gpsrLabelLayoutToSvg } from './pdf/gpsrLabel';
import { previewFontFamilies } from './pdf/fonts';

const IMAGE_DPI = 300;
const MAX_IMAGE_PIXELS = 64_000_000;

export async function createGpsrLabelPng(data: GpsrLabelData): Promise<Blob> {
  const layout = await createGpsrLabelLayout(data);
  if (!layout.valid) throw new Error(layout.errors.join('\n'));
  const width = Math.round(layout.width * IMAGE_DPI / 25.4);
  const height = Math.round(layout.height * IMAGE_DPI / 25.4);
  if (width * height > MAX_IMAGE_PIXELS) throw new Error('图片尺寸过大，请选择较小的标签尺寸。');

  // 独立图片内嵌排版所用字体，确保三语文字与预览、PDF 使用相同字形。
  const fonts = `<style>
    @font-face { font-family: '${previewFontFamilies.NotoSans}'; src: url(data:font/ttf;base64,${layout.assets.latin.base64}) format('truetype'); }
    @font-face { font-family: '${previewFontFamilies.DroidFallback}'; src: url(data:font/ttf;base64,${layout.assets.cjk.base64}) format('truetype'); }
  </style>`;
  const svg = gpsrLabelLayoutToSvg(layout).replace(/(<svg[^>]*>)/, `$1${fonts}`);
  const sourceUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = sourceUrl;
    try { await image.decode(); }
    catch { throw new Error('标签图片加载失败，请重试。'); }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建标签图片画布。');
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG 图片生成失败，请重试。')), 'image/png');
    });
  } finally { URL.revokeObjectURL(sourceUrl); }
}

export async function exportGpsrLabelImage(data: GpsrLabelData) {
  const image = await createGpsrLabelPng(data);
  downloadBlob(image, gpsrLabelFileName(data.draft.ean13, 'png'), 'png');
}
