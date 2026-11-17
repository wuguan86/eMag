import { describe, expect, it } from 'vitest';
import type { ComplianceProfile, DeclarationDraft } from '../src/types';
import { createLabelLayout, labelLayoutToSvg } from '../src/utils/pdf/layout';
import { createLabelPdf, createDeclarationPdf } from '../src/utils/pdf/export';
import { buildDeclaration } from '../src/utils/pdf/declaration';

export const profile: ComplianceProfile = {
  productName: '灯具 Șurubelniță', model: 'AB-12', batch: '2026-01',
  euRep: { name: 'EU SRL', address: 'Str. Unirii 1, București, RO', email: 'eu@example.ro', phone: '' },
  manufacturer: { name: '深圳公司', address: '广东深圳市南山区 10 号', email: 'factory@example.cn', phone: '' },
  warningId: 'none', icons: ['ce', 'weee', 'age', 'triman'], labelSize: '70x40',
};
export const draft: DeclarationDraft = {
  description: 'Portable lamp', legislation: 'Enter applicable legislation manually.', standards: 'EN test standard',
  place: 'București', date: '2026-11-12', signatory: '张三', position: 'Director',
};

describe('打印标签', () => {
  it('按真实毫米尺寸排版并为中文和罗马尼亚文嵌入字体', async () => {
    const layout = await createLabelLayout(profile);
    expect(layout.valid).toBe(true);
    expect([layout.width, layout.height, layout.margin]).toEqual([70, 40, 2]);
    expect(layout.lines.every((line) => line.fontSize >= 6 && line.y <= 38)).toBe(true);
    const doc = await createLabelPdf(profile);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(70, 5);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(40, 5);
    const pdf = doc.output();
    expect(pdf).toContain('/FontFile2');
    expect(pdf).toContain('/ToUnicode');
    expect(pdf).toContain('/MediaBox [0 0 198.425');
  });
  it.each(['50x30', '100x100'] as const)('保留 %s 纸张尺寸', async (labelSize) => {
    const layout = await createLabelLayout({ ...profile, labelSize });
    expect([layout.width, layout.height]).toEqual(labelSize.split('x').map(Number));
  });
  it('短标签利用可用空间放大正文，产品名称保持更清楚的层级', async () => {
    const layout = await createLabelLayout({ ...profile, icons: ['ce', 'weee'] });
    expect(layout.valid).toBe(true);
    const body = layout.lines.filter((line) => line.region !== '产品名称');
    expect(body.every((line) => line.fontSize >= 7)).toBe(true);
    expect(layout.lines[0].fontSize).toBeGreaterThan(body[0].fontSize);
    const textBottom = Math.max(...layout.lines.map((line) => line.y + line.fontSize * 25.4 / 72 * 0.24));
    expect(textBottom).toBeLessThan(Math.min(...layout.icons.map((icon) => icon.y)) - 0.5);
  });
  it('小标签回退字号仍保留完整内容及图标安全距离', async () => {
    const layout = await createLabelLayout({ ...profile, labelSize: '50x30', icons: ['ce'] });
    expect(layout.valid).toBe(true);
    expect(layout.lines.every((line) => line.fontSize >= 6)).toBe(true);
    expect(layout.lines.map((line) => line.text).join('')).toContain('factory@example.cn');
    expect(Math.max(...layout.lines.map((line) => line.y + line.fontSize * 25.4 / 72 * 0.24))).toBeLessThanOrEqual(22);
  });
  it('正文回退 6pt 后，仍尝试利用剩余空间保持产品名层级', async () => {
    const layout = await createLabelLayout({ ...profile, productName: 'Portable lamp Portable lamp Portable lamp Portable lamp' });
    expect(layout.valid).toBe(true);
    expect(layout.lines.find((line) => line.region === '欧盟责任人')!.fontSize).toBe(6);
    expect(layout.lines.filter((line) => line.region === '产品名称').every((line) => line.fontSize > 6)).toBe(true);
  });
  it('缺少公司邮箱时阻止导出并指出必填区域', async () => {
    const invalid = { ...profile, euRep: { ...profile.euRep, email: ' ' } };
    expect((await createLabelLayout(invalid)).errors.join(' ')).toContain('欧盟责任人邮箱');
    await expect(createLabelPdf(invalid)).rejects.toThrow('欧盟责任人邮箱');
  });
  it('长地址明确超容，不截断或扩大页面', async () => {
    const invalid = { ...profile, manufacturer: { ...profile.manufacturer, address: '完整地址'.repeat(100) } };
    const layout = await createLabelLayout(invalid);
    expect(layout.valid).toBe(false);
    expect(layout.errors.join(' ')).toContain('制造商');
    await expect(createLabelPdf(invalid)).rejects.toThrow('超出');
  });
  it('优先在英文单词之间换行，保留完整产品名称', async () => {
    const productName = 'Portable illumination equipment with miniature electronics and accessories';
    const layout = await createLabelLayout({ ...profile, productName, labelSize: '50x30', icons: [] });
    const titleLines = layout.lines.filter((line) => line.region === '产品名称').map((line) => line.text);
    expect(titleLines.join('')).toBe(productName);
    for (const word of productName.split(' ')) expect(titleLines.some((line) => line.includes(word))).toBe(true);
  });
  it('转义预览文本且拒绝字体不支持的字符', async () => {
    const layout = await createLabelLayout({ ...profile, productName: '<script>&"' });
    const svg = labelLayoutToSvg(layout);
    expect(svg.includes('<script>')).toBe(false);
    expect(svg.includes('&lt;script&gt;')).toBe(true);
    expect(svg.includes('font-kerning="none"')).toBe(true);
    expect(svg.includes('font-variant-ligatures:none')).toBe(true);
    expect(svg.includes('font-family="EmagToolkitNotoSans"')).toBe(true);
    expect(svg.includes('textLength=')).toBe(true);
    expect(svg.includes('data:font/ttf')).toBe(false);
    const invalid = await createLabelLayout({ ...profile, productName: '灯😀' });
    expect(invalid.errors.join(' ')).toContain('不支持');
  });
});

describe('DoC 草稿', () => {
  it('主体信息和签署字段分栏且长字段不越过栏边界', async () => {
    const { layout } = await buildDeclaration({ ...profile, euRep: { ...profile.euRep, address: 'Strada foarte lunga '.repeat(20) } }, { ...draft, place: 'Long place '.repeat(30) });
    const lines = layout.pages.flat();
    const manufacturer = lines.filter((line) => line.region === '制造商');
    const representative = lines.filter((line) => line.region === '欧盟责任人');
    expect(Math.min(...manufacturer.map((line) => line.x))).toBeGreaterThan(100);
    expect(representative.every((line) => line.x + line.runs.reduce((width, run) => width + run.width, 0) <= 100)).toBe(true);
    const signature = lines.filter((line) => line.region === '签署区域');
    expect(signature.some((line) => line.x > 100)).toBe(true);
    expect(signature.every((line) => line.x + line.runs.reduce((width, run) => width + run.width, 0) <= 192.01)).toBe(true);
  });
  it('为长法规分页且保留完整文本、每页草稿和完整签署区', async () => {
    const doc = await createDeclarationPdf(profile, { ...draft, legislation: 'Regulation text. '.repeat(1800) + 'END-LEGISLATION' });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 1);
    const pdf = doc.output();
    expect(pdf).toContain('/FontFile2');
    expect(doc.getNumberOfPages()).toBeLessThan(30);
  });
  it('长文保留尾部和完整签署区的同页坐标', async () => {
    const { layout } = await buildDeclaration(profile, { ...draft, description: '中文产品描述 '.repeat(800) + 'END-DESCRIPTION', legislation: 'Article 1. '.repeat(800) + 'END-REGULATION' });
    const allText = layout.pages.flat().map((line) => line.text).join('');
    expect(allText).toContain('END-DESCRIPTION');
    expect(allText).toContain('END-REGULATION');
    const signaturePages = layout.pages.map((page, index) => page.some((line) => line.region === '签署区域') ? index + 1 : 0).filter(Boolean);
    expect(signaturePages).toEqual([layout.signaturePage]);
    expect(layout.signatureTop).toBeGreaterThanOrEqual(33);
    expect(layout.signatureBottom).toBeLessThanOrEqual(272);
  });
  it('同样校验产品与公司信息', async () => {
    await expect(createDeclarationPdf({ ...profile, batch: '' }, draft)).rejects.toThrow('批次');
  });
});
