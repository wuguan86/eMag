import { describe, expect, it } from 'vitest';
import type { ComplianceProfile } from '../src/types';
import { sampleProfile } from '../scripts/pdf-fixtures';
import { createLabelLayout, labelLayoutToSvg } from '../src/utils/pdf/layout';
import { createLabelPdf } from '../src/utils/pdf/export';
import { iconDimensions, iconSvg } from '../src/utils/pdf/icons';

const compactProfile: ComplianceProfile = {
  ...sampleProfile, productName: 'Lamp', model: 'L1', batch: '2026',
  euRep: { name: 'EU SRL', address: 'București, RO', email: 'eu@ex.ro', phone: '' },
  manufacturer: { name: 'Factory', address: 'Shenzhen, CN', email: 'f@ex.cn', phone: '' },
  icons: ['ce', 'weee', 'age', 'triman', 'pap20'],
};

describe('GPSR 标签升级', () => {
  it.each([
    ['general', 'RO: Citiți instrucțiunile înainte de utilizare. A nu se lăsa la îndemâna copiilor. | EN: Read instructions before use. Keep out of reach of children.'],
    ['electronics', 'RO: Feriți de umiditate și temperaturi extreme. Nu dezasamblați. | EN: Keep away from moisture and heat. Do not disassemble.'],
    ['under3', 'RO: AVERTISMENT! Contraindicat copiilor mai mici de 3 ani. Pericol de sufocare. | EN: WARNING! Not suitable for children under 3 years. Choking hazard.'],
    ['textile', 'RO: Respectați instrucțiunile de îngrijire de pe etichetă. | EN: Follow care instructions on label.'],
  ])('完整打印 %s 警示且五图标不挤压正文', async (warningId, expected) => {
    const layout = await createLabelLayout({ ...compactProfile, warningId });
    expect(layout.errors).toEqual([]);
    expect(layout.lines.filter((line) => line.region === '双语警示语').map((line) => line.text).join('')).toBe(expected);
    expect(layout.icons).toHaveLength(5);
  });

  it('拥挤内容可回退至 5.5pt，标题仍尽量保留层级', async () => {
    const layout = await createLabelLayout({ ...compactProfile, warningId: 'under3', productName: 'Portable lamp for home and office' });
    expect(layout.errors).toEqual([]);
    expect(layout.bodyFontSize).toBe(5.5);
    expect(layout.lines[0].fontSize).toBeGreaterThanOrEqual(layout.bodyFontSize);
  });

  it.each(['choking', 'adult', 'bag', 'electrical'])('旧警示 %s 继续打印且不修改配置', async (warningId) => {
    const profile = { ...compactProfile, labelSize: '100x100' as const, warningId };
    const before = JSON.stringify(profile);
    const layout = await createLabelLayout(profile);
    expect(layout.valid).toBe(true);
    expect(layout.lines.some((line) => line.text.includes('WARNING!'))).toBe(true);
    expect(JSON.stringify(profile)).toBe(before);
  });

  it('自定义警示参与字体与控制字符校验', async () => {
    for (const customWarning of ['Keep away 😀', 'Warning\u0001text']) {
      const profile = { ...compactProfile, warningId: 'custom', customWarning };
      const layout = await createLabelLayout(profile);
      expect(layout.errors.join(' ')).toMatch(/自定义警示语.*(不支持|控制字符)/);
      await expect(createLabelPdf(profile)).rejects.toThrow(/自定义警示语/);
    }
    const empty = await createLabelLayout({ ...compactProfile, warningId: 'custom' });
    expect(empty.errors.join(' ')).toContain('请填写自定义警示语');
  });

  it('自定义警示完整输出并转义 SVG 注入', async () => {
    const customWarning = 'EN: Keep <away> & "safe". RO: Atenție!';
    const layout = await createLabelLayout({ ...compactProfile, warningId: 'custom', customWarning });
    expect(layout.valid).toBe(true);
    expect(layout.lines.filter((line) => line.region === '自定义警示语').map((line) => line.text).join('')).toBe(customWarning);
    expect(labelLayoutToSvg(layout)).toContain('&lt;away&gt;');
  });

  it.each(['50x30', '70x40', '100x100'] as const)('%s 尺寸的有效布局所有文字图标均在 2mm 边界内并相互留距', async (labelSize) => {
    for (const warningId of ['none', 'general', 'electronics', 'under3', 'textile', 'custom']) {
      const layout = await createLabelLayout({ ...compactProfile, labelSize, warningId, customWarning: 'EN: Safe use. RO: Utilizare sigură.' });
      if (!layout.valid) {
        expect(labelSize).toBe('50x30');
        expect(layout.errors.join(' ')).toContain('超出');
        continue;
      }
      for (const [index, line] of layout.lines.entries()) {
        expect(line.fontSize).toBeGreaterThanOrEqual(5.5);
        expect(line.x).toBeGreaterThanOrEqual(2);
        expect(line.y - line.fontSize * 25.4 / 72).toBeGreaterThanOrEqual(2 - 0.00001);
        expect(line.x + line.runs.reduce((sum, run) => sum + run.width, 0)).toBeLessThanOrEqual(layout.width - 2 + 0.00001);
        expect(line.y + line.fontSize * 25.4 / 72 * 0.24).toBeLessThanOrEqual(Math.min(...layout.icons.map((icon) => icon.y)) - 0.5 + 0.00001);
        expect(line.bounds.left).toBeGreaterThanOrEqual(2 - 0.00001);
        expect(line.bounds.top).toBeGreaterThanOrEqual(2 - 0.00001);
        expect(line.bounds.right).toBeLessThanOrEqual(layout.width - 2 + 0.00001);
        expect(line.bounds.bottom).toBeLessThanOrEqual(Math.min(...layout.icons.map((icon) => icon.y)) - 0.5 + 0.00001);
        if (index) expect(line.bounds.top).toBeGreaterThanOrEqual(layout.lines[index - 1].bounds.bottom);
      }
      for (const [index, icon] of layout.icons.entries()) {
        expect(icon.x).toBeGreaterThanOrEqual(2);
        expect(icon.y).toBeGreaterThanOrEqual(2);
        expect(icon.x + icon.width).toBeLessThanOrEqual(layout.width - 2);
        expect(icon.y + icon.height).toBeLessThanOrEqual(layout.height - 2);
        for (const other of layout.icons.slice(index + 1)) expect(icon.x + icon.width).toBeLessThanOrEqual(other.x);
      }
    }
  });

  it('任意超长警示明确报区域错误，预览不绘制无效内容', async () => {
    const profile = { ...compactProfile, warningId: 'custom', customWarning: 'Very long warning. '.repeat(300) };
    const layout = await createLabelLayout(profile);
    expect(layout.valid).toBe(false);
    expect(layout.errors.join(' ')).toContain('自定义警示语区域超出');
    expect(labelLayoutToSvg(layout)).not.toContain('<text');
    expect(labelLayoutToSvg(layout)).not.toContain('<path');
    await expect(createLabelPdf(profile)).rejects.toThrow('自定义警示语区域超出');
  });

  it('PAP20 使用有完整路径的矢量图且保留其他标志尺寸', () => {
    expect(iconDimensions('ce').height).toBe(5);
    expect(iconDimensions('weee').height).toBe(7);
    expect(iconDimensions('age').height).toBe(10);
    expect(iconDimensions('triman').height).toBe(6);
    const svg = iconSvg({ id: 'pap20', x: 2, y: 2, ...iconDimensions('pap20') });
    expect(svg).toContain('<path');
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('<image');
  });

  it('实际字形包围盒包含高重音与负边距字符，紧凑行距也不重叠', async () => {
    const layout = await createLabelLayout({
      ...compactProfile, productName: 'Ấj', warningId: 'custom',
      customWarning: 'gjpq ẤȚȘ\ngjpq ẤȚȘ\ngjpq ẤȚȘ',
    });
    expect(layout.errors).toEqual([]);
    for (const [index, line] of layout.lines.entries()) {
      const bounds = line.bounds;
      expect(bounds.left).toBeGreaterThanOrEqual(2 - 0.00001);
      expect(bounds.top).toBeGreaterThanOrEqual(2 - 0.00001);
      expect(bounds.right).toBeLessThanOrEqual(layout.width - 2 + 0.00001);
      expect(bounds.bottom).toBeLessThanOrEqual(Math.min(...layout.icons.map((icon) => icon.y)) - 0.5);
      if (index) expect(bounds.top).toBeGreaterThanOrEqual(layout.lines[index - 1].bounds.bottom);
    }
  });
});
