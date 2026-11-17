import { describe, expect, it } from 'vitest';
import type { GpsrLabelData } from '../src/types';
import { createGpsrLabelLayout, createGpsrLabelPdf, gpsrLabelLayoutToSvg } from '../src/utils/pdf/gpsrLabel';

const data: GpsrLabelData = {
  draft: {
    productName: { zh: '蓝牙耳机', ro: 'Căști Bluetooth', bg: 'Bluetooth слушалки', hu: 'Bluetooth fülhallgató' },
    material: 'plastic', model: 'B003', batch: 'LOT-20261117', ean13: '5901234123457',
    manualUrl: 'https://example.com/manual.pdf', labelSize: '70x80', customWidth: 70,
    customHeight: 80, orientation: 0, icons: ['ce', 'weee'], warningId: 'choking',
  },
  euRep: { name: 'EU Safety SRL', address: 'Strada Exemplu 1, Bucharest, Romania', email: 'safety@example.eu', phone: '' },
  manufacturer: { name: 'Shenzhen Audio Co Ltd', address: 'Building 2, Shenzhen, Guangdong, China', email: 'factory@example.cn', phone: '' },
};

describe('GPSR 标签 PDF', () => {
  it('将多语言主体、图标、条码与二维码放入 70 × 80 mm 安全边距内', async () => {
    const layout = await createGpsrLabelLayout(data);
    expect(layout.valid).toBe(true);
    expect([layout.width, layout.height, layout.margin]).toEqual([70, 80, 2]);
    expect(layout.barcode).not.toBeNull();
    expect(layout.qrCode).not.toBeNull();
    expect(layout.qrCode?.size).toBe(12);
    expect(layout.qrCode?.x).toBe(56);
    expect(layout.lines.map((line) => line.text).join(' ')).toContain('Căști Bluetooth');
    expect(layout.lines.map((line) => line.text).join(' ')).not.toContain('蓝牙耳机');
    expect(layout.icons).toHaveLength(2);

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
    expect(layout.qrCode).toMatchObject({ x: 29, size: 12 });
    expect(gpsrLabelLayoutToSvg(layout)).toContain('xlink:href="data:image/png;base64,');
  });

  it('在有 EAN 或 URL 错误時拒绝导出', async () => {
    await expect(createGpsrLabelPdf({ ...data, draft: { ...data.draft, ean13: '5901234123458' } }))
      .rejects.toThrow('EAN-13');
    await expect(createGpsrLabelPdf({ ...data, draft: { ...data.draft, manualUrl: 'javascript:alert(1)' } }))
      .rejects.toThrow('HTTP(S)');
  });

  it('EU REP 电话包含中文时阻止生成预览和 PDF', async () => {
    const invalid = { ...data, euRep: { ...data.euRep, phone: '请拨打 123456' } };
    const layout = await createGpsrLabelLayout(invalid);
    expect(layout.valid).toBe(false);
    expect(layout.errors.join(' ')).toContain('欧盟责任人联系电话必须使用英文或拼音');
    await expect(createGpsrLabelPdf(invalid)).rejects.toThrow('欧盟责任人联系电话');
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

  it('企业资料溢出时将两栏文字限制在各自边框内，避免压住标志和警示语', async () => {
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
    expect(layout.valid).toBe(true);
    const preview = gpsrLabelLayoutToSvg(layout);
    expect(preview).toContain('clipPath');
    expect(preview).toContain('clip-path="url(#company-0)"');
    expect(preview).toContain('clip-path="url(#company-1)"');
    expect(layout.icons).toHaveLength(4);
    expect(layout.icons.every((icon) => icon.height >= 6 && icon.height <= 7)).toBe(true);
    expect(layout.boxes.every((box) => box.height >= 19)).toBe(true);
  });
});
