import { jsPDF } from 'jspdf';
import type { ComplianceProfile } from '../../types';
import { labelSizes, MM_PER_PT, warningOptions } from './constants';
import { fontForCharacter, installFonts, previewFontFamilies, type PdfFont } from './fonts';
import { iconDimensions, iconSvg, type LabelIcon } from './icons';
import { escapeXml, wrapText, type FontAssets, type TextLine, type TextRun } from './text';
import { profileSections, validateProfile, validateWarning } from './validation';

export interface LabelLayout {
  width: number; height: number; margin: number; valid: boolean; errors: string[];
  lines: LabelTextLine[]; icons: LabelIcon[]; assets: FontAssets; bodyFontSize: number;
  hasChinese: boolean;
}

interface TextBounds { left: number; top: number; right: number; bottom: number }
interface LabelTextLine extends TextLine { bounds: TextBounds }
interface TrueTypeMetadata {
  head: { unitsPerEm: number }; loca: { offsets: number[] }; glyf: { offset: number };
  rawData: Uint8Array; characterToGlyph: (code: number) => number;
}

function createGlyphMeasurer(doc: jsPDF) {
  const cache = new Map<string, TextBounds & { advance: number }>();
  const glyph = (character: string, font: PdfFont) => {
    const key = `${font}:${character}`;
    const existing = cache.get(key);
    if (existing) return existing;
    doc.setFont(font);
    doc.setFontSize(1);
    const metadata = doc.getFont().metadata as unknown as TrueTypeMetadata;
    const index = metadata.characterToGlyph(character.codePointAt(0)!);
    const offset = metadata.loca.offsets[index];
    const units = metadata.head.unitsPerEm;
    // TrueType 字形头部直接记录实际轮廓包围盒，包含组合重音、负侧边距和下伸部。
    const value = (position: number) => {
      const address = metadata.glyf.offset + offset + position;
      const unsigned = metadata.rawData[address] * 256 + metadata.rawData[address + 1];
      return (unsigned >= 32768 ? unsigned - 65536 : unsigned) / units;
    };
    const empty = offset === metadata.loca.offsets[index + 1];
    const bounds = { left: empty ? 0 : value(2), top: empty ? 0 : -value(8), right: empty ? 0 : value(6), bottom: empty ? 0 : -value(4), advance: doc.getTextWidth(character) / MM_PER_PT };
    cache.set(key, bounds);
    return bounds;
  };
  return {
    padding(text: string, fontSize: number, assets: FontAssets) {
      let left = 0;
      let right = 0;
      for (const character of text) {
        if (character === '\n' || character === '\r') continue;
        const bounds = glyph(character, fontForCharacter(character, assets) ?? 'NotoSans');
        left = Math.max(left, -bounds.left);
        right = Math.max(right, bounds.right - bounds.advance);
      }
      return { left: left * fontSize * MM_PER_PT, right: right * fontSize * MM_PER_PT };
    },
    measure(runs: TextRun[], fontSize: number): TextBounds {
      const scale = fontSize * MM_PER_PT;
      let advance = 0;
      let left = 0;
      let right = 0;
      let top = 0;
      let bottom = 0;
      for (const run of runs) for (const character of run.text) {
        const bounds = glyph(character, run.font);
        left = Math.min(left, advance + bounds.left * scale);
        right = Math.max(right, advance + bounds.right * scale);
        top = Math.min(top, bounds.top * scale);
        bottom = Math.max(bottom, bounds.bottom * scale);
        advance += bounds.advance * scale;
      }
      return { left, right: Math.max(right, advance), top, bottom };
    },
  };
}

export function newLabelDocument(width: number, height: number) {
  return new jsPDF({ unit: 'mm', format: [width, height], orientation: width > height ? 'landscape' : 'portrait', compress: true, putOnlyUsedFonts: true });
}

export async function createLabelLayout(profile: ComplianceProfile): Promise<LabelLayout> {
  const [width, height] = labelSizes[profile.labelSize] ?? labelSizes['70x40'];
  const margin = 2;
  const doc = newLabelDocument(width, height);
  const assets = await installFonts(doc);
  const measurer = createGlyphMeasurer(doc);
  const errors = validateProfile(profile, assets);
  const selectedWarning = warningOptions.find((option) => option.id === profile.warningId);
  if (!selectedWarning) errors.push('警示语选项无效，请重新选择。');
  const icons: LabelIcon[] = [];
  let iconX = margin;
  for (const id of [...new Set(profile.icons)]) {
    if (!['ce', 'weee', 'age', 'triman', 'pap20'].includes(id)) { errors.push('合规图标选项无效。'); continue; }
    const size = iconDimensions(id);
    icons.push({ id, ...size, x: iconX, y: height - margin - size.height });
    iconX += size.width + 3;
  }
  if (iconX - 3 > width - margin) errors.push('合规图标区域超出标签宽度，请减少图标或使用更大尺寸。');
  if (icons.some((icon) => icon.x < margin || icon.y < margin || icon.x + icon.width > width - margin || icon.y + icon.height > height - margin)) {
    errors.push('合规图标区域超出标签可打印边界，请减少图标或选择更大尺寸。');
  }
  const bottom = height - margin - (icons.length ? Math.max(...icons.map((icon) => icon.height)) + 1 : 0);
  const sections = profileSections(profile);
  const warningText = profile.warningId === 'custom' ? profile.customWarning ?? '' : selectedWarning?.text ?? '';
  if (selectedWarning && (warningText || profile.warningId === 'custom')) {
    const region = profile.warningId === 'custom' ? '自定义警示语' : '双语警示语';
    errors.push(...validateWarning(warningText, region, assets));
    sections.push({ region, text: warningText });
  }
  const hasChinese = sections.some((section) => /[\u4e00-\u9fa5]/.test(section.text));
  // 保留原字号与标题层级；拥挤时逐级收紧到 5.5pt，纸张、完整文本和图标尺寸不变。
  let lines: LabelTextLine[] = [];
  let bodyFontSize = 6;
  for (const [candidate, titleSize, spacing] of [[7, 8, 1.16], [6.5, 7.5, 1.16], [6, 7, 1.16], [6, 6, 1.16], [5.5, 6.5, 1.08], [5.5, 5.5, 1.04]]) {
    const candidateLines: LabelTextLine[] = [];
    let y = margin;
    let previousRegion = '';
    for (const section of sections) {
      const fontSize = section.region === '产品名称' ? titleSize : candidate;
      const lineHeight = fontSize * MM_PER_PT * spacing;
      if (previousRegion && previousRegion !== section.region && ['欧盟责任人', '制造商', '双语警示语', '自定义警示语'].includes(section.region)) {
        y += candidate > 6 ? 0.6 : 0;
      }
      const padding = measurer.padding(section.text, fontSize, assets);
      const wrapped = wrapText(doc, section.text, width - margin * 2 - padding.left - padding.right, fontSize, assets);
      for (const runs of wrapped) {
        const measured = measurer.measure(runs, fontSize);
        const x = margin + padding.left;
        const previousBottom = candidateLines.at(-1)?.bounds.bottom ?? margin;
        // 紧凑行距仍按实际字形保留净空，高重音或深下伸部不能压住相邻行或越过上边距。
        const baseline = Math.max(y + fontSize * MM_PER_PT, margin - measured.top, previousBottom + 0.05 - measured.top);
        const bounds = { left: x + measured.left, right: x + measured.right, top: baseline + measured.top, bottom: baseline + measured.bottom };
        candidateLines.push({ runs, text: runs.map((run) => run.text).join(''), x, y: baseline, fontSize, region: section.region, bounds });
        y = baseline - fontSize * MM_PER_PT + lineHeight;
      }
      previousRegion = section.region;
    }
    lines = candidateLines;
    bodyFontSize = candidate;
    if (lines.every((line) => Math.max(line.bounds.bottom, line.y + line.fontSize * MM_PER_PT * 0.24) <= bottom)) break;
  }
  for (const line of lines) {
    if (Math.max(line.bounds.bottom, line.y + line.fontSize * MM_PER_PT * 0.24) > bottom && !errors.some((error) => error.startsWith(`${line.region}区域超出`))) {
      errors.push(`${line.region}区域超出标签可打印高度，请缩短内容或选择更大尺寸。正文不会截断或小于 5.5pt。`);
    }
    if ((line.bounds.left < margin - 0.00001 || line.bounds.right > width - margin + 0.00001 || line.bounds.top < margin - 0.00001) && !errors.some((error) => error.startsWith(`${line.region}区域超出`))) {
      errors.push(`${line.region}区域超出标签可打印边界，请调整内容或选择更大尺寸。`);
    }
  }
  return { width, height, margin, valid: errors.length === 0, errors, lines, icons, assets, bodyFontSize, hasChinese };
}

export function labelLayoutToSvg(layout: LabelLayout) {
  // 无效布局只返回原尺寸空白纸，避免预览把越界、缺字或未通过校验的内容误当作可打印结果。
  if (!layout.valid) return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}mm" height="${layout.height}mm" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="标签内容无效"><rect width="100%" height="100%" fill="white"/></svg>`;
  const text = layout.lines.map((line) => {
    let x = line.x;
    const runs = line.runs.map((run) => {
      // 浏览器小字号存在字体尺寸量化误差，显式锁定 PDF 字形总宽度，避免长行累积偏差。
      const span = `<tspan x="${x}" font-family="${previewFontFamilies[run.font]}" textLength="${run.width}" lengthAdjust="spacingAndGlyphs">${escapeXml(run.text)}</tspan>`;
      x += run.width;
      return span;
    }).join('');
    return `<text y="${line.y}" font-size="${line.fontSize * MM_PER_PT}" fill="#000" font-kerning="none" style="font-kerning:none;font-variant-ligatures:none;letter-spacing:0;word-spacing:0" xml:space="preserve">${runs}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}mm" height="${layout.height}mm" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="打印标签预览"><rect width="100%" height="100%" fill="white"/>${text}${layout.icons.map(iconSvg).join('')}</svg>`;
}
