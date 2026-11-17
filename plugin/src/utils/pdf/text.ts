import type { jsPDF } from 'jspdf';
import { fontForCharacter, type loadFontAssets, type PdfFont } from './fonts';

export interface TextRun { text: string; font: PdfFont; width: number }
export interface TextLine { runs: TextRun[]; text: string; x: number; y: number; fontSize: number; region: string; bold?: boolean }
export type FontAssets = Awaited<ReturnType<typeof loadFontAssets>>;

export function normalizeText(text: string) {
  return text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
}

export function unsupportedCharacters(text: string, assets: FontAssets) {
  return [...new Set([...normalizeText(text)].filter((character) => character !== '\n' && !fontForCharacter(character, assets)))];
}

// 逐字测量使用 PDF 中同一份字体指标；长单词、邮箱和中文都不会越过右边界。
export function wrapText(doc: jsPDF, text: string, width: number, fontSize: number, assets: FontAssets): TextRun[][] {
  doc.setFontSize(fontSize);
  const lines: TextRun[][] = [];
  let runs: TextRun[] = [];
  let lineWidth = 0;
  const finish = () => { lines.push(runs); runs = []; lineWidth = 0; };
  const tokens = normalizeText(text).match(/\n|[^\S\n]+|[\u2e80-\u9fff\uf900-\ufaff]|[^\s\u2e80-\u9fff\uf900-\ufaff]+/g) ?? [];
  for (const token of tokens) {
    if (token === '\n') { finish(); continue; }
    const characters = [...token].map((character) => {
      const font = fontForCharacter(character, assets) ?? 'NotoSans';
      doc.setFont(font);
      return { character, font, characterWidth: doc.getTextWidth(character) };
    });
    const tokenWidth = characters.reduce((sum, character) => sum + character.characterWidth, 0);
    // 英文优先按词换行；中文逐字，超长邮箱和单词按字回退，保留所有原始字符。
    if (tokenWidth <= width && lineWidth + tokenWidth > width && runs.length) finish();
    for (const { character, font, characterWidth } of characters) {
      if (lineWidth + characterWidth > width && runs.length) finish();
      const last = runs.at(-1);
      if (last?.font === font) { last.text += character; last.width += characterWidth; }
      else runs.push({ text: character, width: characterWidth, font });
      lineWidth += characterWidth;
    }
  }
  finish();
  return lines;
}

export function drawTextLine(doc: jsPDF, line: TextLine) {
  doc.setFontSize(line.fontSize);
  let x = line.x;
  for (const run of line.runs) {
    doc.setFont(run.font, line.bold ? 'bold' : 'normal');
    if (line.bold) doc.setLineWidth(0.12);
    doc.text(run.text, x, line.y, { baseline: 'alphabetic', renderingMode: line.bold ? 'fillThenStroke' : 'fill' });
    x += run.width;
  }
}

export function escapeXml(text: string) {
  return text.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}
