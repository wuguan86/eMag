import { jsPDF } from 'jspdf';
import type { ComplianceProfile, DeclarationDraft } from '../../types';
import { MM_PER_PT } from './constants';
import { installFonts } from './fonts';
import { drawTextLine, unsupportedCharacters, wrapText, type TextLine } from './text';
import { profileSections, validateProfile } from './validation';

export interface DeclarationLayout { pages: TextLine[][]; signaturePage: number; signatureTop: number; signatureBottom: number }

export async function buildDeclaration(profile: ComplianceProfile, draft: DeclarationDraft) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
  const assets = await installFonts(doc);
  const errors = validateProfile(profile, assets);
  for (const [field, value] of Object.entries(draft)) {
    if (unsupportedCharacters(value, assets).length) errors.push(`声明字段 ${field} 包含离线字体不支持的字符，请修改后导出。`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const pages: TextLine[][] = [[]];
  let y = 34;
  const newPage = () => { pages.push([]); y = 34; };
  const lineHeight = (fontSize: number) => fontSize * MM_PER_PT * 1.45;
  const append = (text: string, region: string, fontSize = 10, gap = 4) => {
    for (const runs of wrapText(doc, text, 174, fontSize, assets)) {
      if (y + 1.3 > 272) newPage();
      pages.at(-1)!.push({ text: runs.map((run) => run.text).join(''), runs, x: 18, y, fontSize, region });
      y += lineHeight(fontSize);
    }
    y += gap;
  };
  const heading = (text: string, region: string) => {
    // 标题至少携带后续两行内容，避免长文分页后只留下孤立章节标题。
    const height = wrapText(doc, text, 174, 11.5, assets).length * lineHeight(11.5) + 16;
    if (y + height > 272) newPage();
    append(text, region, 11.5, 4);
  };
  type Cell = { text: string; region: string };
  const columnHeight = (left: Cell, right: Cell) => Math.max(...[left, right].map((cell) => wrapText(doc, cell.text, 82, 10, assets).length)) * lineHeight(10) + 5;
  const appendColumns = (left: Cell, right: Cell) => {
    const columns = [left, right].map((cell) => ({ ...cell, lines: wrapText(doc, cell.text, 82, 10, assets) }));
    const rows = Math.max(...columns.map((column) => column.lines.length));
    // 两栏按行同步分页；长地址和签署字段均按各自栏宽换行，保留完整原文。
    for (let row = 0; row < rows; row++) {
      if (y + 1.3 > 272) newPage();
      columns.forEach((column, index) => {
        const runs = column.lines[row];
        if (runs) pages.at(-1)!.push({ text: runs.map((run) => run.text).join(''), runs, x: index ? 110 : 18, y, fontSize: 10, region: column.region });
      });
      y += lineHeight(10);
    }
    y += 5;
  };
  append('EU DECLARATION OF CONFORMITY - DRAFT', '标题', 15, 6);
  append('Working draft only. Review all applicable legislation, standards and evidence before signing. This document is not a signed declaration of conformity.', '草稿说明', 9, 7);
  heading('1. Product identification', '产品标题');
  append(profile.productName, '产品名称', 11, 3);
  appendColumns({ text: `Model: ${profile.model}`, region: '型号与批次' }, { text: `Batch: ${profile.batch}`, region: '型号与批次' });
  const sections = profileSections(profile);
  appendColumns(
    { text: sections.filter((section) => section.region === '欧盟责任人').map((section) => section.text).join('\n'), region: '欧盟责任人' },
    { text: sections.filter((section) => section.region === '制造商').map((section) => section.text).join('\n'), region: '制造商' },
  );
  y += 3;
  heading('2. Object of the declaration', '描述标题');
  append(draft.description.trim() || '[Description to be completed]', '产品描述');
  append('This declaration is issued under the sole responsibility of the manufacturer identified above.', '责任说明', 9, 7);
  heading('3. Applicable Union harmonisation legislation', '法规标题');
  append(draft.legislation.trim() || '[Applicable legislation to be entered and verified]', '适用法规');
  heading('4. References to harmonised standards / other technical specifications', '标准标题');
  append(draft.standards.trim() || '[Applicable standards to be entered and verified]', '适用标准');
  const signatureCells = [
    `Place: ${draft.place.trim() || '[To be completed]'}`, `Date: ${draft.date.trim() || '[To be completed]'}`,
    `Name: ${draft.signatory.trim() || '[To be completed]'}`, `Position: ${draft.position.trim() || '[To be completed]'}`,
  ].map((text) => ({ text, region: '签署区域' }));
  const signatureHeading = '5. Signed for and on behalf of the manufacturer';
  const signatureHeight = wrapText(doc, signatureHeading, 174, 11.5, assets).length * lineHeight(11.5) + 4
    + columnHeight(signatureCells[0], signatureCells[1]) + columnHeight(signatureCells[2], signatureCells[3]) + 13 + lineHeight(10) + 4;
  if (signatureHeight > 238) throw new Error('签署区域超出 A4 单页高度，请缩短签署人、职位或签署地点。签署区不能拆页。');
  if (y + signatureHeight > 272) newPage();
  const signatureTop = y;
  const signaturePage = pages.length;
  append(signatureHeading, '签署区域', 11.5, 4);
  appendColumns(signatureCells[0], signatureCells[1]);
  appendColumns(signatureCells[2], signatureCells[3]);
  y += 13;
  append('Signature: ________________________________________', '签署区域');
  const signatureBottom = y;
  for (let index = 0; index < pages.length; index++) {
    if (index) doc.addPage('a4', 'portrait');
    doc.setTextColor('#7f1d1d');
    const headerRuns = wrapText(doc, '草稿 / DRAFT - NOT SIGNED', 174, 10, assets)[0];
    drawTextLine(doc, { runs: headerRuns, text: '', x: 18, y: 18, fontSize: 10, region: '草稿页眉' });
    doc.setDrawColor('#d0d0d0'); doc.setLineWidth(0.25); doc.line(18, 23, 192, 23);
    doc.setTextColor('#171717');
    for (const line of pages[index]) drawTextLine(doc, line);
    doc.setFont('NotoSans'); doc.setFontSize(8); doc.setTextColor('#666666');
    doc.text(`DRAFT - Page ${index + 1} / ${pages.length} - Review required before signing`, 18, 286);
  }
  const layout: DeclarationLayout = { pages, signaturePage, signatureTop, signatureBottom };
  return { doc, layout };
}
