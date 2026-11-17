import type { ComplianceProfile, DeclarationDraft } from '../../types';
import { buildDeclaration } from './declaration';
import { installFonts } from './fonts';
import { drawIcon } from './icons';
import { createLabelLayout, newLabelDocument } from './layout';
import { drawTextLine } from './text';

// 返回 jsPDF 实例，浏览器下载、Node 落盘与 PDF 检查共享同一条生成路径。
export async function createLabelPdf(profile: ComplianceProfile) {
  const layout = await createLabelLayout(profile);
  if (!layout.valid) throw new Error(layout.errors.join('\n'));
  const doc = newLabelDocument(layout.width, layout.height);
  await installFonts(doc);
  for (const line of layout.lines) drawTextLine(doc, line);
  for (const icon of layout.icons) drawIcon(doc, icon);
  doc.setProperties({ title: 'Packaging compliance label', subject: 'Print at actual size / 100%' });
  return doc;
}

export async function createDeclarationPdf(profile: ComplianceProfile, draft: DeclarationDraft) {
  return (await buildDeclaration(profile, draft)).doc;
}

export async function exportLabel(profile: ComplianceProfile): Promise<void> {
  const doc = await createLabelPdf(profile);
  doc.save('compliance-label.pdf');
}

export async function exportDeclaration(profile: ComplianceProfile, draft: DeclarationDraft): Promise<void> {
  const doc = await createDeclarationPdf(profile, draft);
  doc.save('eu-declaration-DRAFT.pdf');
}
