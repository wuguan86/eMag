import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { GpsrLabelData } from '../../types';
import { gpsrBarcodeValidationMessage, isValidGpsrBarcode, renderGpsrBarcode } from '../gpsrBarcode';
import { gpsrLabelFileName, hasCjkCharacters, isValidManualUrl, materialOptions, resolveGpsrPageSize, warningOptions } from '../gpsrLabel';
import { installFonts, previewFontFamilies } from './fonts';
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
  frame: { x: number; y: number; width: number; height: number };
  rules: { x1: number; y1: number; x2: number; y2: number }[];
  euRepLogo: { x: number; y: number; width: number; height: number; dividerX: number };
  bottomColumns: { leftX: number; leftWidth: number; dividerX: number; rightX: number; rightWidth: number; top: number; bottom: number };
  barcode: { svg: string; x: number; y: number; width: number; height: number; value: string } | null;
  qrCode: { dataUrl: string; x: number; y: number; size: number } | null;
  assets: FontAssets;
}

const MM_PER_PT = 25.4 / 72;
const COMPACT_LINE_HEIGHT = 1.15;
const SECTION_VERTICAL_PADDING = 1.2;
const MIN_SECTION_VERTICAL_PADDING = 0.5;
const BOTTOM_SECTION_HEIGHT = 23;
const REP_LOGO_WIDTH = 23.5;
const REP_LOGO_HEIGHT = 7.25;
const REP_LOGO_FONT_SIZE = 14.5;
const REP_LOGO_STROKE_WIDTH = 0.25;

function lineHeight(fontSize: number) {
  return fontSize * MM_PER_PT * COMPACT_LINE_HEIGHT;
}

function validateData(data: GpsrLabelData, errors: string[]) {
  const { draft, euRep, manufacturer } = data;
  for (const language of ['zh', 'ro', 'bg', 'hu'] as const) {
    if (!draft.productName[language].trim()) errors.push(`请填写${language.toUpperCase()} 产品名称。`);
  }
  if (!draft.model.trim()) errors.push('请填写型号。');
  if (!draft.batch.trim()) errors.push('请填写批次号。');
  if (!draft.material) errors.push('请选择产品材质。');
  for (const [label, company] of [['欧盟责任人', euRep], ['制造商', manufacturer]] as const) {
    for (const key of ['name', 'address', 'email'] as const) {
      if (!company[key].trim()) errors.push(`请填写${label}${key === 'name' ? '公司名称' : key === 'address' ? '地址' : '邮箱'}。`);
      if (hasCjkCharacters(company[key])) errors.push(`${label}信息必须使用英文或拼音。`);
    }
  }
  if (draft.ean13 && !isValidGpsrBarcode(draft.ean13)) errors.push(gpsrBarcodeValidationMessage);
  if (!isValidManualUrl(draft.manualUrl)) errors.push('说明书地址必须是有效的 HTTP(S) URL。');
  if (!Object.hasOwn(warningOptions, draft.warningId)) errors.push('安全警示语选项无效。');
}

function addCenteredText(doc: jsPDF, lines: TextLine[], value: string, region: string, centerX: number, y: number, size: number, assets: FontAssets, strokeWidth = 0) {
  const wrapped = wrapText(doc, value, 100, size, assets);
  for (const runs of wrapped) {
    const lineWidth = runs.reduce((sum, run) => sum + run.width, 0);
    lines.push({ runs, text: runs.map((run) => run.text).join(''), x: centerX - lineWidth / 2, y, fontSize: size, region, strokeWidth });
    y += lineHeight(size);
  }
}

function createTextSection(doc: jsPDF, assets: FontAssets, region: string, x: number, width: number, entries: [string, number][], options: { referenceHeight: number; minimumHeight?: number; strokeWidth?: number }) {
  const lines: TextLine[] = [];
  let contentHeight = 0;
  for (const [value, fontSize] of entries) {
    for (const runs of wrapText(doc, value, width, fontSize, assets)) {
      const y = contentHeight + fontSize * MM_PER_PT;
      lines.push({ runs, text: runs.map((run) => run.text).join(''), x, y, fontSize, region, strokeWidth: options.strokeWidth });
      contentHeight += lineHeight(fontSize);
    }
  }
  return {
    lines, contentHeight, referenceHeight: options.referenceHeight,
    minimumHeight: Math.max(options.minimumHeight ?? 0, contentHeight),
  };
}

function layoutTextSections(sections: ReturnType<typeof createTextSection>[], top: number, bottom: number) {
  const availableHeight = bottom - top;
  const contentHeight = sections.reduce((sum, section) => sum + section.minimumHeight, 0);
  // 小尺寸或长文案优先缩减留白，保留必要的上下边距。
  const padding = Math.max(MIN_SECTION_VERTICAL_PADDING, Math.min(SECTION_VERTICAL_PADDING, (availableHeight - contentHeight) / sections.length));
  const minimumHeight = contentHeight + padding * sections.length;
  const referenceHeight = sections.reduce((sum, section) => sum + section.referenceHeight, 0);
  // 优先保证内容换行所需的高度，再按参考图的栏高分配剩余空间。
  const deficits = sections.map((section) => Math.max(0, section.referenceHeight / referenceHeight * availableHeight - section.minimumHeight - padding));
  const totalDeficit = deficits.reduce((sum, deficit) => sum + deficit, 0);
  const scale = totalDeficit > 0 ? Math.max(0, availableHeight - minimumHeight) / totalDeficit : 0;
  let sectionTop = top;
  const ends = sections.map((section, index) => {
    const sectionHeight = section.minimumHeight + padding + deficits[index] * scale;
    const gaps = section.lines.length - 1;
    const lineGap = gaps > 0 ? Math.min(0.55, (sectionHeight - section.contentHeight - padding) / gaps) : 0;
    const textTop = sectionTop + (sectionHeight - section.contentHeight - lineGap * gaps) / 2;
    section.lines.forEach((line, lineIndex) => { line.y += textTop + lineGap * lineIndex; });
    sectionTop += sectionHeight;
    return sectionTop;
  });
  const fits = minimumHeight <= availableHeight + 0.001;
  if (fits) ends[ends.length - 1] = bottom;
  return { ends, fits };
}

function createBarcodeSvg(value: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  renderGpsrBarcode(svg, value, 32);
  return svg.outerHTML;
}

function drawBarcode(doc: jsPDF, svgText: string, x: number, y: number, width: number, height: number) {
  doc.setFillColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  const parser = new DOMParser();
  const svg = parser.parseFromString(svgText, 'image/svg+xml').documentElement;
  const viewBox = svg.getAttribute('viewBox')?.split(/[ ,]+/).map(Number);
  const sourceWidth = viewBox?.[2] || Number(svg.getAttribute('width'));
  const sourceHeight = viewBox?.[3] || Number(svg.getAttribute('height'));
  if (!sourceWidth || !sourceHeight) throw new Error('商品条码无法生成。');
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const left = x + (width - sourceWidth * scale) / 2;
  const top = y + (height - sourceHeight * scale) / 2;
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
      doc.rect(left + rectX * scale, top + rectY * scale, rectWidth * scale, rectHeight * scale, 'F');
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
  const frame = { x: margin, y: margin, width: contentWidth, height: height - margin * 2 };
  const rules: GpsrLabelLayout['rules'] = [];
  const sectionX = frame.x + 1.5;
  const sectionWidth = frame.width - 3;
  const addRule = (ruleY: number) => rules.push({ x1: frame.x, y1: ruleY, x2: frame.x + frame.width, y2: ruleY });
  const productName = [data.draft.productName.ro, data.draft.productName.bg, data.draft.productName.hu].join('/');
  const material = materialOptions.find((option) => option.id === data.draft.material);
  const warning = warningOptions.choking;
  const repTextX = sectionX + REP_LOGO_WIDTH + 1;
  const sections = [
    createTextSection(doc, assets, '产品基本信息', sectionX, sectionWidth, [
      [`Product Name: ${productName}`, 5.8],
      [`Product Material: ${[material?.en, material?.bg, material?.hu].filter(Boolean).join('/')}`, 5.6],
      [`Batch Number: ${data.draft.batch}`, 5.6],
    ], { referenceHeight: 11.1 }),
    createTextSection(doc, assets, '制造商', sectionX, sectionWidth, [
      [`Manufacturer: ${data.manufacturer.name}`, 5.4],
      [`Adresa: ${data.manufacturer.address}`, 5.4],
      [`E-mail: ${data.manufacturer.email}`, 5.4],
    ], { referenceHeight: 10.3 }),
    createTextSection(doc, assets, 'EU REP', repTextX, sectionX + sectionWidth - repTextX, [
      [`Name: ${data.euRep.name}`, 5.3],
      [`Adress: ${data.euRep.address}`, 5.3],
      [`E-mail: ${data.euRep.email}`, 5.3],
    ], { referenceHeight: 11, minimumHeight: REP_LOGO_HEIGHT }),
    createTextSection(doc, assets, '安全警示语', sectionX, sectionWidth, [
      ['WARNING:', 5.6], [warning.ro, 5], [warning.bg, 5], [warning.hu, 5],
    ], { referenceHeight: 20.1, strokeWidth: 0.08 }),
  ];
  const bottomColumns = {
    leftX: sectionX,
    leftWidth: sectionWidth * 0.55,
    dividerX: sectionX + sectionWidth * 0.55,
    rightX: sectionX + sectionWidth * 0.55,
    rightWidth: sectionWidth * 0.45,
    top: frame.y + frame.height - BOTTOM_SECTION_HEIGHT,
    bottom: frame.y + frame.height,
  };
  const { ends, fits } = layoutTextSections(sections, frame.y, bottomColumns.top);
  lines.push(...sections.flatMap((section) => section.lines));
  ends.forEach(addRule);
  const [, manufacturerEnd, repEnd] = ends;
  const logoCenterY = (manufacturerEnd + repEnd) / 2;
  const euRepLogo = { x: sectionX, y: logoCenterY - REP_LOGO_HEIGHT / 2, width: REP_LOGO_WIDTH, height: REP_LOGO_HEIGHT, dividerX: sectionX + REP_LOGO_WIDTH * 0.4 };
  // 标志使用大写字母的实际高度居中，预览和 PDF 使用同一描边宽度。
  const logoBaseline = logoCenterY + REP_LOGO_FONT_SIZE * MM_PER_PT * 0.357;
  addCenteredText(doc, lines, 'EU', 'EU REP 标志', sectionX + REP_LOGO_WIDTH * 0.2, logoBaseline, REP_LOGO_FONT_SIZE, assets, REP_LOGO_STROKE_WIDTH);
  addCenteredText(doc, lines, 'REP', 'EU REP 标志', sectionX + REP_LOGO_WIDTH * 0.7, logoBaseline, REP_LOGO_FONT_SIZE, assets, REP_LOGO_STROKE_WIDTH);

  const { top: bottomSectionTop } = bottomColumns;
  const selectedIcons: LabelIcon[] = (['ce', 'age'] as const).map((id, index) => {
    const { width, height } = gpsrIconDimensions(id);
    const centerX = bottomColumns.leftX + bottomColumns.leftWidth * (index + 0.5) / 2;
    return { id, x: centerX - width / 2, y: bottomSectionTop + 1, width, height, monochrome: true };
  });

  const hasBarcode = isValidGpsrBarcode(data.draft.ean13);
  const hasQrCode = Boolean(data.draft.manualUrl && isValidManualUrl(data.draft.manualUrl));
  const barcode = hasBarcode ? {
    svg: createBarcodeSvg(data.draft.ean13),
    x: bottomColumns.leftX + 1, y: bottomSectionTop + 10, width: bottomColumns.leftWidth - 2, height: 9, value: data.draft.ean13,
  } : null;
  if (barcode) addCenteredText(doc, lines, barcode.value, '商品条码', bottomColumns.leftX + bottomColumns.leftWidth / 2, bottomSectionTop + 20.7, 5.2, assets);
  const qrCode = hasQrCode ? {
    dataUrl: await QRCode.toDataURL(data.draft.manualUrl, { errorCorrectionLevel: 'H', margin: 1, width: 384 }),
    x: bottomColumns.rightX + (bottomColumns.rightWidth - 18) / 2, y: bottomSectionTop + 0.6, size: 18,
  } : null;
  if (qrCode) addCenteredText(doc, lines, 'manual/Ръководство/kézi', '说明书二维码', bottomColumns.rightX + bottomColumns.rightWidth / 2, bottomColumns.bottom - 1.5, 4.5, assets);

  if (!fits) errors.push('安全警示语区域超出标签高度，请缩短产品或企业信息，或选择更大尺寸。');
  if (selectedIcons.some((icon) => icon.y + icon.height > bottomSectionTop + 10)) errors.push('标志区域超出标签高度。');
  const regionEnds: Record<string, number> = {
    产品基本信息: rules[0].y1,
    制造商: rules[1].y1,
    'EU REP': rules[2].y1,
    安全警示语: rules[3].y1,
  };
  for (const line of lines) {
    const lineWidth = line.runs.reduce((sum, run) => sum + run.width, 0);
    if (line.x < margin - 0.001 || line.x + lineWidth > width - margin + 0.001 || line.y > height - margin - 0.5) {
      if (!errors.some((error) => error.startsWith(`${line.region}区域超出`))) errors.push(`${line.region}区域超出标签可打印边界，请调整内容或选择更大尺寸。`);
    }
    const regionEnd = regionEnds[line.region];
    if (regionEnd !== undefined && line.y + line.fontSize * MM_PER_PT * 0.08 > regionEnd) {
      if (!errors.some((error) => error.startsWith(`${line.region}区域超出`))) errors.push(`${line.region}区域超出标签可打印高度，请缩短内容或选择更大尺寸。`);
    }
  }
  return {
    width, height, margin, valid: errors.length === 0, errors, lines, icons: selectedIcons,
    frame, rules, euRepLogo, bottomColumns, barcode, qrCode, assets,
  };
}

export function gpsrLabelLayoutToSvg(layout: GpsrLabelLayout) {
  const lines = layout.lines.map((line) => {
    const spans = line.runs.map((run) => `<tspan font-family="${previewFontFamilies[run.font]}">${escapeXml(run.text)}</tspan>`).join('');
    const stroke = line.strokeWidth ? ` stroke="#000" stroke-width="${line.strokeWidth}"` : '';
    return `<text x="${line.x}" y="${line.y}" font-size="${line.fontSize * MM_PER_PT}" font-weight="400" fill="#000"${stroke}>${spans}</text>`;
  }).join('');
  const barcodeViewBox = layout.barcode?.svg.match(/viewBox="([\d. ]+)"/)?.[1] ?? '';
  const barcode = layout.barcode
    ? `<svg x="${layout.barcode.x}" y="${layout.barcode.y}" width="${layout.barcode.width}" height="${layout.barcode.height}" viewBox="${barcodeViewBox}">${layout.barcode.svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1] ?? ''}</svg>` : '';
  const qr = layout.qrCode ? `<image x="${layout.qrCode.x}" y="${layout.qrCode.y}" width="${layout.qrCode.size}" height="${layout.qrCode.size}" href="${layout.qrCode.dataUrl}" xlink:href="${layout.qrCode.dataUrl}"/>` : '';
  const frame = `<rect x="${layout.frame.x}" y="${layout.frame.y}" width="${layout.frame.width}" height="${layout.frame.height}" fill="none" stroke="#111" stroke-width="0.3"/>`;
  const rules = layout.rules.map((rule) => `<line x1="${rule.x1}" y1="${rule.y1}" x2="${rule.x2}" y2="${rule.y2}" stroke="#111" stroke-width="0.3"/>`).join('');
  const logo = `<rect x="${layout.euRepLogo.x}" y="${layout.euRepLogo.y}" width="${layout.euRepLogo.width}" height="${layout.euRepLogo.height}" fill="none" stroke="#000" stroke-width="0.6"/><line x1="${layout.euRepLogo.dividerX}" y1="${layout.euRepLogo.y}" x2="${layout.euRepLogo.dividerX}" y2="${layout.euRepLogo.y + layout.euRepLogo.height}" stroke="#000" stroke-width="0.6"/>`;
  const label = layout.valid ? 'GPSR 标签预览' : 'GPSR 标签预览，存在排版错误';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${layout.width}mm" height="${layout.height}mm" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="${label}"><rect width="100%" height="100%" fill="#fff"/>${frame}${rules}${logo}${lines}${layout.icons.map(iconSvg).join('')}${barcode}${qr}</svg>`;
}

export async function createGpsrLabelPdf(data: GpsrLabelData) {
  const layout = await createGpsrLabelLayout(data);
  if (!layout.valid) throw new Error(layout.errors.join('\n'));
  const doc = new jsPDF({ unit: 'mm', format: [layout.width, layout.height], orientation: layout.width > layout.height ? 'landscape' : 'portrait', compress: true, putOnlyUsedFonts: true });
  await installFonts(doc);
  doc.setDrawColor(20, 20, 20); doc.setLineWidth(0.3); doc.rect(layout.frame.x, layout.frame.y, layout.frame.width, layout.frame.height);
  doc.setLineWidth(0.3);
  for (const rule of layout.rules) doc.line(rule.x1, rule.y1, rule.x2, rule.y2);
  doc.setDrawColor(0);
  doc.setLineWidth(0.6); doc.rect(layout.euRepLogo.x, layout.euRepLogo.y, layout.euRepLogo.width, layout.euRepLogo.height);
  doc.line(layout.euRepLogo.dividerX, layout.euRepLogo.y, layout.euRepLogo.dividerX, layout.euRepLogo.y + layout.euRepLogo.height);
  for (const line of layout.lines) drawTextLine(doc, line);
  for (const icon of layout.icons) drawIcon(doc, icon);
  if (layout.barcode) drawBarcode(doc, layout.barcode.svg, layout.barcode.x, layout.barcode.y, layout.barcode.width, layout.barcode.height);
  if (layout.qrCode) doc.addImage(layout.qrCode.dataUrl, 'PNG', layout.qrCode.x, layout.qrCode.y, layout.qrCode.size, layout.qrCode.size);
  doc.setProperties({ title: 'GPSR product safety label', subject: 'Print at actual size / 100%' });
  return doc;
}

export async function exportGpsrLabel(data: GpsrLabelData) {
  const doc = await createGpsrLabelPdf(data);
  doc.save(gpsrLabelFileName(data.draft.ean13, 'pdf'));
}
