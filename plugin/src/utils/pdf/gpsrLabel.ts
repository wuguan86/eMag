import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import type { GpsrLabelData, GpsrMaterialId } from '../../types';
import { hasCjkCharacters, isValidEan13, isValidManualUrl, materialOptions, resolveGpsrPageSize, warningOptions } from '../gpsrLabel';
import { installFonts } from './fonts';
import { drawIcon, gpsrIconDimensions, iconSvg, type LabelIcon } from './icons';
import { drawTextLine, escapeXml, wrapText, type FontAssets, type TextLine } from './text';

export interface GpsrLabelLayout {
  width: number;
  height: number;
  margin: number;
  valid: boolean;
  errors: string[];
  lines: TextLine[];
  icons: LabelIcon[];
  boxes: { x: number; y: number; width: number; height: number }[];
  barcode: { svg: string; x: number; y: number; width: number; height: number; value: string } | null;
  qrCode: { dataUrl: string; x: number; y: number; size: number; label: string } | null;
  assets: FontAssets;
}

const barcodeOptions = { format: 'EAN13', width: 0.72, height: 12, displayValue: false, margin: 2, background: '#ffffff', lineColor: '#000000' } as const;
const MM_PER_PT = 25.4 / 72;
const COMPACT_LINE_HEIGHT = 1.16;

function lineHeight(fontSize: number) {
  return fontSize * MM_PER_PT * COMPACT_LINE_HEIGHT;
}

function addText(doc: jsPDF, lines: TextLine[], value: string, region: string, x: number, top: number, width: number, size: number, lineHeight = size * 0.36, bold = false) {
  const wrapped = wrapText(doc, value, width, size, { latin: { base64: '', ranges: [[0, 65535]] }, cjk: { base64: '', ranges: [] } });
  wrapped.forEach((runs, index) => lines.push({ runs, text: runs.map((run) => run.text).join(''), x, y: top + size * 25.4 / 72 + index * lineHeight, fontSize: size, region, bold }));
  return top + wrapped.length * lineHeight;
}

function getMaterialLabel(id: GpsrMaterialId | '') {
  return materialOptions.find((item) => item.id === id)?.en ?? '';
}

function validateData(data: GpsrLabelData, errors: string[]) {
  const { draft, euRep, manufacturer } = data;
  for (const language of ['zh', 'ro', 'bg', 'hu'] as const) {
    if (!draft.productName[language].trim()) errors.push(`请填写${language.toUpperCase()} 产品名称。`);
  }
  if (!draft.model.trim()) errors.push('请填写型号。');
  if (!draft.batch.trim()) errors.push('请填写批次号。');
  for (const [label, company] of [['欧盟责任人', euRep], ['制造商', manufacturer]] as const) {
    for (const key of ['name', 'address', 'email'] as const) {
      if (!company[key].trim()) errors.push(`请填写${label}${key === 'name' ? '公司名称' : key === 'address' ? '地址' : '邮箱'}。`);
      if (hasCjkCharacters(company[key])) errors.push(`${label}信息必须使用英文或拼音。`);
    }
    if (company.phone.trim() && hasCjkCharacters(company.phone)) errors.push(`${label}联系电话必须使用英文或拼音。`);
  }
  if (draft.ean13 && !isValidEan13(draft.ean13)) errors.push('EAN-13 必须是校验位正确的 13 位数字。');
  if (!isValidManualUrl(draft.manualUrl)) errors.push('说明书地址必须是有效的 HTTP(S) URL。');
  if (draft.warningId === 'none' && !warningOptions.none) errors.push('安全警示语选项无效。');
}

function createBarcodeSvg(value: string, width: number, height: number) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, value, barcodeOptions);
  svg.dataset.targetWidth = String(width);
  svg.dataset.targetHeight = String(height);
  return svg.outerHTML;
}

function drawBarcode(doc: jsPDF, svgText: string, x: number, y: number, width: number, height: number) {
  const parser = new DOMParser();
  const svg = parser.parseFromString(svgText, 'image/svg+xml').documentElement;
  const viewBox = svg.getAttribute('viewBox')?.split(/[ ,]+/).map(Number);
  const sourceWidth = viewBox?.[2] || Number(svg.getAttribute('width'));
  const sourceHeight = viewBox?.[3] || Number(svg.getAttribute('height'));
  if (!sourceWidth || !sourceHeight) throw new Error('EAN 条码无法生成。');
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  for (const group of [...svg.querySelectorAll('g')]) {
    const translation = /translate\(\s*([\d.-]+)(?:[ ,]+([\d.-]+))?\s*\)/.exec(group.getAttribute('transform') ?? '');
    const offsetX = Number(translation?.[1] ?? 0);
    const offsetY = Number(translation?.[2] ?? 0);
    for (const rect of [...group.querySelectorAll('rect')]) {
      const fill = rect.getAttribute('fill') ?? group.getAttribute('fill') ?? '#000000';
      if (fill === 'none' || fill === '#ffffff' || fill === 'white') continue;
      const rectX = Number(rect.getAttribute('x') ?? 0) + offsetX;
      const rectY = Number(rect.getAttribute('y') ?? 0) + offsetY;
      const rectWidth = Number(rect.getAttribute('width') ?? 0);
      const rectHeight = Number(rect.getAttribute('height') ?? 0);
      doc.rect(x + rectX * scale, y + rectY * scale, rectWidth * scale, rectHeight * scale, 'F');
    }
  }
}

export async function createGpsrLabelLayout(data: GpsrLabelData): Promise<GpsrLabelLayout> {
  const { width, height, margin } = resolveGpsrPageSize(data.draft);
  const doc = new jsPDF({ unit: 'mm', format: [width, height], orientation: width > height ? 'landscape' : 'portrait', compress: true, putOnlyUsedFonts: true });
  const assets = await installFonts(doc);
  const errors: string[] = [];
  validateData(data, errors);
  const lines: TextLine[] = [];
  const contentWidth = width - margin * 2;
  const titleTop = margin;
  let titleBottom = titleTop;
  const localizedNames = [
    ['RO', data.draft.productName.ro], ['BG', data.draft.productName.bg], ['HU', data.draft.productName.hu],
  ] as const;
  for (const [language, name] of localizedNames) {
    titleBottom = addText(doc, lines, `${language}: ${name}`, '产品名称', margin, titleBottom, contentWidth, 7, lineHeight(7), true);
  }

  const material = getMaterialLabel(data.draft.material);
  const metadataTop = titleBottom + 0.2;
  const metadata = [`Model: ${data.draft.model}`, material ? `Material: ${material}` : '', `Batch: ${data.draft.batch}`].filter(Boolean).join('  |  ');
  const metadataBottom = addText(doc, lines, metadata, '产品追溯信息', margin, metadataTop, contentWidth, 5.5, lineHeight(5.5));

  const boxTop = metadataBottom + 1;
  const gap = 2;
  const boxWidth = (contentWidth - gap) / 2;
  const hasBarcode = Boolean(data.draft.ean13 && isValidEan13(data.draft.ean13));
  const hasQrCode = Boolean(data.draft.manualUrl && isValidManualUrl(data.draft.manualUrl));
  const traceabilityHeight = hasQrCode ? 15 : hasBarcode ? 14 : 0;
  const bottomTop = height - margin - traceabilityHeight;
  const warning = warningOptions[data.draft.warningId];
  const warningTexts = [['RO', warning.ro], ['BG', warning.bg], ['HU', warning.hu]] as const;
  const warningRows = warningTexts.reduce((total, [, text]) => total + (text ? wrapText(doc, text, contentWidth, 6, { latin: { base64: '', ranges: [[0, 65535]] }, cjk: { base64: '', ranges: [] } }).length : 0), 0);
  const plannedWarningHeight = warningRows * lineHeight(6) + (warningRows ? 0.3 : 0);
  const iconSizes = [...new Set(data.draft.icons)].map((id) => ({ id, ...gpsrIconDimensions(id) }));
  const plannedIconHeight = Math.max(0, ...iconSizes.map((icon) => icon.height));
  const availableBoxHeight = bottomTop - boxTop - plannedWarningHeight - plannedIconHeight - 2.5;
  const boxBottom = boxTop + Math.min(20, Math.max(0, availableBoxHeight));
  const boxHeight = boxBottom - boxTop;
  const actors = [
    { label: 'EU REP', name: data.euRep.name, address: data.euRep.address, email: data.euRep.email, phone: data.euRep.phone, x: margin },
    { label: 'Manufacturer', name: data.manufacturer.name, address: data.manufacturer.address, email: data.manufacturer.email, phone: '', x: margin + boxWidth + gap },
  ];
  const boxes = actors.map((actor) => ({ x: actor.x, y: boxTop, width: boxWidth, height: boxHeight }));
  for (const actor of actors) {
    doc.setDrawColor(20, 20, 20); doc.setLineWidth(0.25); doc.rect(actor.x, boxTop, boxWidth, boxHeight);
    let y = addText(doc, lines, actor.label, actor.label, actor.x + 1, boxTop + 1, boxWidth - 2, 7, lineHeight(7), true) + 0.2;
    for (const [field, value] of [['Name', actor.name], ['Address', actor.address], ['Email', actor.email], ['Phone', actor.phone]] as const) {
      if (!value.trim()) continue;
      y = addText(doc, lines, `${field}: ${value}`, actor.label, actor.x + 1, y, boxWidth - 2, 6, lineHeight(6)) + 0.2;
    }
    if (y > boxBottom - 0.2) errors.push(`${actor.label === 'EU REP' ? '欧盟责任人' : '制造商'}区域超出标签可打印高度，请缩短地址或选择更大尺寸。`);
  }

  const iconY = boxBottom + 1;
  const selectedIcons: LabelIcon[] = [];
  const iconWidth = iconSizes.reduce((sum, item) => sum + item.width, 0) + Math.max(0, iconSizes.length - 1) * 2;
  let iconX = margin + Math.max(0, (contentWidth - iconWidth) / 2);
  for (const icon of iconSizes) {
    if (iconX + icon.width > width - margin) errors.push('合规标志区域超出标签宽度，请减少标志或使用更大尺寸。');
    selectedIcons.push({ id: icon.id, x: iconX, y: iconY, width: icon.width, height: icon.height });
    iconX += icon.width + 2;
  }

  const iconBottom = iconY + Math.max(0, ...selectedIcons.map((icon) => icon.height));
  const warningTop = iconBottom + (selectedIcons.length ? 1 : 0.5);
  let warningBottom = warningTop;
  for (const [language, text] of warningTexts) {
    if (text) warningBottom = addText(doc, lines, `${language}: ${text}`, '安全警示语', margin, warningBottom, contentWidth, 6, lineHeight(6));
  }

  if (warningBottom > bottomTop - 0.2) errors.push('安全警示语区域超出标签可打印高度，请缩短警示语或选择更大尺寸。');
  const barcodeWidth = contentWidth - (hasQrCode ? 18 : 0);
  const barcodeHeight = 12;
  const barcode = hasBarcode ? {
    svg: createBarcodeSvg(data.draft.ean13, barcodeWidth, barcodeHeight), x: margin, y: bottomTop + (hasQrCode ? 1 : 0),
    width: barcodeWidth, height: barcodeHeight, value: data.draft.ean13,
  } : null;
  const qrCode = hasQrCode ? {
    dataUrl: await QRCode.toDataURL(data.draft.manualUrl, { errorCorrectionLevel: 'H', margin: 1, width: 256 }),
    x: hasBarcode ? width - margin - 12 : (width - 12) / 2, y: bottomTop + 2, size: 12, label: 'User Manual / Info',
  } : null;
  if (barcode) {
    lines.push({ runs: [{ text: barcode.value, font: 'NotoSans', width: 0 }], text: barcode.value, x: margin, y: height - margin - 1.2, fontSize: 4.8, region: 'EAN-13' });
  }
  if (qrCode) addText(doc, lines, qrCode.label, '说明书二维码', qrCode.x - (hasBarcode ? 3 : 6), bottomTop + 0.1, hasBarcode ? 18 : 24, 4.3, lineHeight(4.3));

  for (const line of lines) {
    doc.setFont(line.runs[0]?.font ?? 'NotoSans'); doc.setFontSize(line.fontSize);
    const lineWidth = line.runs.reduce((sum, run) => sum + run.width, 0);
    if (line.x < margin - 0.001 || line.x + lineWidth > width - margin + 0.001 || line.y > height - margin + 0.001) {
      if (!errors.some((error) => error.startsWith(`${line.region}区域超出`))) errors.push(`${line.region}区域超出标签可打印边界，请调整内容或选择更大尺寸。`);
    }
  }
  return { width, height, margin, valid: errors.length === 0, errors, lines, icons: selectedIcons, boxes, barcode, qrCode, assets };
}

export function gpsrLabelLayoutToSvg(layout: GpsrLabelLayout) {
  const lines = layout.lines.map((line) => {
    const spans = line.runs.map((run) => `<tspan font-family="${run.font === 'NotoSans' ? 'EmagToolkitNotoSans' : 'EmagToolkitDroidFallback'}">${escapeXml(run.text)}</tspan>`).join('');
    const companyIndex = line.region === 'EU REP' ? 0 : line.region === 'Manufacturer' ? 1 : -1;
    const clip = companyIndex >= 0 ? ` clip-path="url(#company-${companyIndex})"` : '';
    return `<text${clip} x="${line.x}" y="${line.y}" font-size="${line.fontSize * MM_PER_PT}" font-weight="${line.bold ? 700 : 400}" fill="#000">${spans}</text>`;
  }).join('');
  const barcodeViewBox = layout.barcode?.svg.match(/viewBox="([\d. ]+)"/)?.[1] ?? '';
  const barcode = layout.barcode
    ? `<svg x="${layout.barcode.x}" y="${layout.barcode.y}" width="${layout.barcode.width}" height="${layout.barcode.height}" viewBox="${barcodeViewBox}">${layout.barcode.svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1] ?? ''}</svg>` : '';
  const qr = layout.qrCode ? `<image x="${layout.qrCode.x}" y="${layout.qrCode.y}" width="${layout.qrCode.size}" height="${layout.qrCode.size}" href="${layout.qrCode.dataUrl}" xlink:href="${layout.qrCode.dataUrl}"/>` : '';
  const boxes = layout.boxes.map((box) => `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="none" stroke="#111" stroke-width="0.25"/>`).join('');
  const companyClips = layout.boxes.map((box, index) => `<clipPath id="company-${index}"><rect x="${box.x + 0.5}" y="${box.y + 0.5}" width="${Math.max(0, box.width - 1)}" height="${Math.max(0, box.height - 1)}"/></clipPath>`).join('');
  const label = layout.valid ? 'GPSR 标签预览' : 'GPSR 标签预览，存在排版错误';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${layout.width}mm" height="${layout.height}mm" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="${label}"><defs>${companyClips}</defs><rect width="100%" height="100%" fill="#fff"/>${boxes}${lines}${layout.icons.map(iconSvg).join('')}${barcode}${qr}</svg>`;
}

export async function createGpsrLabelPdf(data: GpsrLabelData) {
  const layout = await createGpsrLabelLayout(data);
  if (!layout.valid) throw new Error(layout.errors.join('\n'));
  const doc = new jsPDF({ unit: 'mm', format: [layout.width, layout.height], orientation: layout.width > layout.height ? 'landscape' : 'portrait', compress: true, putOnlyUsedFonts: true });
  await installFonts(doc);
  for (const box of layout.boxes) {
    doc.setDrawColor(20, 20, 20); doc.setLineWidth(0.25); doc.rect(box.x, box.y, box.width, box.height);
  }
  for (const line of layout.lines) drawTextLine(doc, line);
  for (const icon of layout.icons) drawIcon(doc, icon);
  if (layout.barcode) drawBarcode(doc, layout.barcode.svg, layout.barcode.x, layout.barcode.y, layout.barcode.width, layout.barcode.height);
  if (layout.qrCode) doc.addImage(layout.qrCode.dataUrl, 'PNG', layout.qrCode.x, layout.qrCode.y, layout.qrCode.size, layout.qrCode.size);
  doc.setProperties({ title: 'GPSR product safety label', subject: 'Print at actual size / 100%' });
  return doc;
}

export async function exportGpsrLabel(data: GpsrLabelData) {
  const doc = await createGpsrLabelPdf(data);
  doc.save('gpsr-product-label.pdf');
}
