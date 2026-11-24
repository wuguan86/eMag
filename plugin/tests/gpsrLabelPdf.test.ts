import JsBarcode from 'jsbarcode';
import { describe, expect, it } from 'vitest';
import type { GpsrLabelData } from '../src/types';
import { createGpsrLabelLayout, createGpsrLabelPdf, gpsrLabelLayoutToSvg } from '../src/utils/pdf/gpsrLabel';
import { createGpsrLabelPng } from '../src/utils/gpsrLabelImage';

const data: GpsrLabelData = {
  draft: {
    productName: { zh: '蓝牙耳机', ro: 'Căști Bluetooth', bg: 'Bluetooth слушалки', hu: 'Bluetooth fülhallgató' },
    material: 'plastic', model: 'B003', productSize: '42 cm', batch: 'v2024122719', ean13: '5901234123457',
    manualUrl: 'https://example.com/manual.pdf', labelSize: '70x80', customWidth: 70,
    customHeight: 80, orientation: 0, icons: ['ce', 'weee'], warningId: 'choking',
  },
  euRep: { name: 'EU Safety SRL', address: 'Strada Exemplu 1, Bucharest, Romania', email: 'safety@example.eu', phone: '' },
  manufacturer: { name: 'Shenzhen Audio Co Ltd', address: 'Building 2, Shenzhen, Guangdong, China', email: 'factory@example.cn', phone: '' },
};

describe('GPSR 标签 PDF', () => {
  it('将多语言主体、图标、条码与二维码放入 70 × 80 mm 安全边距内', async () => {
    const layout = await createGpsrLabelLayout(data);
    expect(layout.valid, layout.errors.join(' ')).toBe(true);
    expect([layout.width, layout.height, layout.margin]).toEqual([70, 80, 2]);
    expect(layout.barcode).not.toBeNull();
    expect(layout.qrCode).not.toBeNull();
    expect(layout.qrCode?.size).toBe(18);
    expect(layout.qrCode?.x).toBeGreaterThan(layout.bottomColumns.dividerX);
    expect(layout.lines.map((line) => line.text).join(' ')).toContain('Căști Bluetooth');
    expect(layout.lines.map((line) => line.text).join(' ')).not.toContain('蓝牙耳机');
    const labelText = layout.lines.map((line) => line.text).join('\n');
    expect(labelText.replace(/\s+/g, ' ')).toContain('Product Name: Căști Bluetooth/Bluetooth слушалки/Bluetooth fülhallgató');
    expect(labelText).toContain('Product Material: Plastic/Пластмаса/Műanyag');
    expect(labelText).toContain('Batch Number: v2024122719');
    expect(labelText.indexOf('Manufacturer: Shenzhen Audio Co Ltd')).toBeLessThan(labelText.indexOf('Name: EU Safety SRL'));
    expect(layout.frame).toEqual({ x: 2, y: 2, width: 66, height: 76 });
    expect(layout.rules).toHaveLength(4);
    const [productEnd, manufacturerEnd, repEnd, warningEnd] = layout.rules.map((rule) => rule.y1);
    expect(productEnd - layout.frame.y).toBeGreaterThan(10.9);
    expect(manufacturerEnd - productEnd).toBeGreaterThan(10);
    expect(warningEnd).toBe(layout.bottomColumns.top);
    expect(layout.bottomColumns.bottom - warningEnd).toBeLessThan(24);
    expect(layout.euRepLogo.height).toBeLessThan(8);
    expect(layout.euRepLogo.y + layout.euRepLogo.height / 2).toBeCloseTo((manufacturerEnd + repEnd) / 2);
    const logoText = layout.lines.filter((line) => line.region === 'EU REP 标志');
    expect(logoText.map((line) => line.text)).toEqual(['EU', 'REP']);
    expect(logoText.every((line) => (line.strokeWidth ?? 0) > 0.12 && line.fontSize > 12)).toBe(true);
    expect(layout.qrCode?.size).toBe(18);
    expect(layout.bottomColumns?.dividerX).toBeGreaterThan(layout.bottomColumns?.leftX ?? 0);
    expect(labelText.replace(/\s+/g, ' ')).toContain('Pentru a evita pericolul de sufocare, țineți această pungă de plastic departe de bebeluși și copii.');
    expect(layout.icons.map((icon) => icon.id)).toEqual(['ce', 'age']);
    expect(gpsrLabelLayoutToSvg(layout)).not.toMatch(/#ed1c24/i);

    const doc = await createGpsrLabelPdf(data);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(70, 5);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(80, 5);
    expect(doc.output()).toContain('/FontFile2');
  });

  it('横向标签交换物理页面宽高', async () => {
    const compact = {
      ...data,
      draft: { ...data.draft, orientation: 90 as const, warningId: 'none' as const, icons: [] },
      euRep: { name: 'EU', address: 'EU Street', email: 'e@example.eu', phone: '' },
      manufacturer: { name: 'Factory', address: 'Shenzhen', email: 'f@example.cn', phone: '' },
    };
    const layout = await createGpsrLabelLayout(compact);
    expect([layout.width, layout.height]).toEqual([80, 70]);
    const doc = await createGpsrLabelPdf(compact);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(80, 5);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(70, 5);
  });

  it('仅有说明书二维码时在标签底部居中显示', async () => {
    const qrOnly = {
      ...data,
      draft: { ...data.draft, ean13: '', warningId: 'none' as const, icons: [] },
      euRep: { name: 'EU', address: 'EU Street', email: 'e@example.eu', phone: '' },
      manufacturer: { name: 'Factory', address: 'Shenzhen', email: 'f@example.cn', phone: '' },
    };
    const layout = await createGpsrLabelLayout(qrOnly);
    expect(layout.barcode).toBeNull();
    expect(layout.qrCode).toMatchObject({ size: 18 });
    expect(gpsrLabelLayoutToSvg(layout)).toContain('xlink:href="data:image/png;base64,');
  });

  it.each(['753758108612', '0590123412348'])('将商品码 %s 按原值编码为 Code 128 并生成 PDF', async (ean13) => {
    const withBarcode = { ...data, draft: { ...data.draft, ean13 } };
    const layout = await createGpsrLabelLayout(withBarcode);
    expect(layout.valid, layout.errors.join(' ')).toBe(true);
    expect(layout.barcode?.value).toBe(ean13);
    const expected = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(expected, ean13, { format: 'CODE128', width: 1, displayValue: false });
    const barcodeSvg = new DOMParser().parseFromString(layout.barcode!.svg, 'image/svg+xml');
    const bars = (root: ParentNode) => [...root.querySelectorAll('g rect')].map((rect) => [rect.getAttribute('x'), rect.getAttribute('width')]);
    expect(bars(barcodeSvg)).toEqual(bars(expected));
    expect(layout.lines.some((line) => line.text === ean13)).toBe(true);
    await expect(createGpsrLabelPdf(withBarcode)).resolves.toBeTruthy();
  });

  it('在商品码或说明书 URL 无效时拒绝导出', async () => {
    await expect(createGpsrLabelPdf({ ...data, draft: { ...data.draft, ean13: '59012341234A' } }))
      .rejects.toThrow('12 或 13 位数字');
    await expect(createGpsrLabelPng({ ...data, draft: { ...data.draft, ean13: '59012341234A' } }))
      .rejects.toThrow('12 或 13 位数字');
    await expect(createGpsrLabelPdf({ ...data, draft: { ...data.draft, manualUrl: 'javascript:alert(1)' } }))
      .rejects.toThrow('HTTP(S)');
  });

  it('忽略旧资料中的欧代电话，不将电话加入 GPSR 标签', async () => {
    const withLegacyPhone = { ...data, euRep: { ...data.euRep, phone: '请拨打 123456' } };
    const layout = await createGpsrLabelLayout(withLegacyPhone);
    expect(layout.valid).toBe(true);
    expect(layout.lines.map((line) => line.text).join(' ')).not.toContain('123456');
    await expect(createGpsrLabelPdf(withLegacyPhone)).resolves.toBeTruthy();
  });

  it('超长公司地址不会静默截断或越过标签边界', async () => {
    const invalid = await createGpsrLabelLayout({
      ...data,
      manufacturer: { ...data.manufacturer, address: 'Long industrial address '.repeat(100) },
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join(' ')).toContain('制造商');
    const preview = gpsrLabelLayoutToSvg(invalid);
    expect(preview).toContain('GPSR 标签预览');
    expect(preview).toContain('Căști Bluetooth');
    await expect(createGpsrLabelPdf({
      ...data,
      manufacturer: { ...data.manufacturer, address: 'Long industrial address '.repeat(100) },
    })).rejects.toThrow('制造商');
  });

  it('企业资料过长时阻止标签导出，避免压住标志和警示语', async () => {
    const crowded: GpsrLabelData = {
      ...data,
      draft: {
        ...data.draft,
        productName: {
          zh: '美国俱乐部SN92软壳三层加绒',
          ro: 'Ghete de iarnă AMERICAN CLUB SN92, Softshell, TripleTex, negru, 42 EU',
          bg: 'Зимни ботки AMERICAN CLUB SN92, Softshell, TripleTex, черни, 42 EU',
          hu: 'AMERICAN CLUB SN92 téli bakancs, Softshell, TripleTex, fekete, 42 EU',
        },
        icons: ['ce', 'weee', 'age', 'triman'],
      },
      euRep: {
        name: 'Ginger Cat Company',
        address: '29 Pirotska St., Apt. 134000 Plovdiv Bulgaria',
        email: '596007871@qq.com',
        phone: '13226262525',
      },
      manufacturer: {
        name: 'huasuo', address: 'dongwan', email: '596337154@qq.com', phone: '',
      },
    };
    const layout = await createGpsrLabelLayout(crowded);
    expect(layout.valid, layout.errors.join(' ')).toBe(true);
    const preview = gpsrLabelLayoutToSvg(layout);
    expect(preview).toContain('stroke-width="0.3"');
    expect(layout.icons.map((icon) => icon.id)).toEqual(['ce', 'age']);
    expect(layout.rules).toHaveLength(4);
  });
});
