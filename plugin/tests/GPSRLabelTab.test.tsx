import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GPSRLabelTab } from '../src/components/GPSRLabelTab';

beforeEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('GPSR 标签表单', () => {
  it('仅显示产品编号输入框，不显示批次输入框', () => {
    render(<GPSRLabelTab product={null}/>);

    expect(screen.getByLabelText('产品编号')).toBeTruthy();
    expect(screen.queryByLabelText('型号 · Model No.')).toBeNull();
    expect(screen.queryByLabelText('生产批次 · Batch No.')).toBeNull();
  });

  it('分区导航在隔离容器内定位目标且不修改页面地址', () => {
    render(<GPSRLabelTab product={null}/>);
    const settings = screen.getByRole('heading', { name: '标签尺寸与安全信息' }).closest('section')!;
    const scrollToSection = vi.fn();
    settings.scrollIntoView = scrollToSection;
    fireEvent.click(within(screen.getByRole('navigation', { name: 'GPSR 标签分区' })).getByRole('button', { name: '标签设置' }));
    expect(scrollToSection).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
  });

  it('默认收起企业详细字段，摘要提示资料状态并可展开编辑', async () => {
    render(<GPSRLabelTab product={null}/>);
    const rep = screen.getByRole('heading', { name: '欧盟责任人 · EU REP' }).closest('section')!;

    expect(within(rep).getByText('资料未填写完整')).toBeTruthy();
    expect(within(rep).queryByRole('textbox', { name: 'Company Name' })).toBeNull();
    fireEvent.click(within(rep).getByRole('button', { name: '填写资料' }));
    expect(within(rep).getByLabelText('Company Name')).toBeTruthy();
    expect(within(rep).queryByLabelText(/^Phone/)).toBeNull();
    expect(within(rep).getByRole('button', { name: '收起编辑' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('收起已填写企业资料后显示关键信息摘要', async () => {
    render(<GPSRLabelTab product={null}/>);
    const rep = screen.getByRole('heading', { name: '欧盟责任人 · EU REP' }).closest('section')!;
    fireEvent.click(within(rep).getByRole('button', { name: '填写资料' }));
    fireEvent.change(within(rep).getByLabelText('Company Name'), { target: { value: 'EU Safety SRL' } });
    fireEvent.change(within(rep).getByLabelText('EU Postal Address'), { target: { value: 'Bucharest, Romania' } });
    fireEvent.change(within(rep).getByLabelText('Email'), { target: { value: 'safety@example.eu' } });
    fireEvent.click(within(rep).getByRole('button', { name: '收起编辑' }));

    expect(within(rep).getByText('EU Safety SRL · Bucharest, Romania · safety@example.eu')).toBeTruthy();
    expect(within(rep).getByText('资料完整')).toBeTruthy();
    expect(within(rep).queryByRole('textbox', { name: 'Company Name' })).toBeNull();
  });

  it('显示新默认尺寸、适用性标志与无警示语默认值', async () => {
    render(<GPSRLabelTab product={null}/>);
    expect((screen.getByLabelText('打印尺寸') as HTMLSelectElement).value).toBe('70x80');
    expect(screen.getByRole('button', { name: '0° · 纵向' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('checkbox', { name: /CE 标志/ }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('checkbox', { name: /WEEE/ }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('安全警示语') as HTMLSelectElement).value).toBe('none');
    expect((screen.getByRole('button', { name: /一键下载热敏打印 PDF/ }) as HTMLButtonElement).disabled).toBe(true);
    await screen.findByRole('alert');
  });

  it('把 eMAG 商品名导入中文字段并可清空产品信息', async () => {
    const product = { productId: 'P1', url: 'https://www.emag.ro/pd/P1/', title: '蓝牙耳机', imageUrl: null, priceRon: null,
      sellerName: null, isEmagSeller: null, otherOfferCount: null, brandName: null, breadcrumbs: null,
      lowestOtherOfferRon: null, sources: {}, missingFields: [], capturedAt: 0 };
    render(<GPSRLabelTab product={product}/>);
    fireEvent.click(screen.getByRole('button', { name: '从当前商品导入' }));
    await waitFor(() => expect((screen.getByLabelText('商品原始品名') as HTMLInputElement).value).toBe('蓝牙耳机'));
    fireEvent.click(screen.getByRole('button', { name: '清空重填' }));
    expect((screen.getByLabelText('商品原始品名') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('产品编号') as HTMLInputElement).value).toBe('');
  });

  it('点击翻译后填充三语结果且保留逐项编辑', async () => {
    const translations: Record<string, string> = { ro: 'Căști Bluetooth', bg: 'Bluetooth слушалки', hu: 'Bluetooth fülhallgató' };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const target = new URL(String(input)).searchParams.get('langpair')?.split('|')[1] ?? '';
      return Response.json({ responseStatus: 200, responseData: { translatedText: translations[target] } });
    }));
    render(<GPSRLabelTab product={null}/>);
    fireEvent.change(screen.getByLabelText('商品原始品名'), { target: { value: '蓝牙耳机' } });
    fireEvent.click(screen.getByRole('button', { name: '翻译并生成三语品名' }));
    await waitFor(() => expect((screen.getByLabelText('罗马尼亚语 · RO') as HTMLInputElement).value).toBe('Căști Bluetooth'));
    expect((screen.getByLabelText('保加利亚语 · BG') as HTMLInputElement).value).toBe('Bluetooth слушалки');
    expect((screen.getByLabelText('匈牙利语 · HU') as HTMLInputElement).value).toBe('Bluetooth fülhallgató');
    fireEvent.change(screen.getByLabelText('罗马尼亚语 · RO'), { target: { value: 'Căști modificate' } });
    expect((screen.getByLabelText('罗马尼亚语 · RO') as HTMLInputElement).value).toBe('Căști modificate');
  });

  it('有效标签布局完成后启用 PDF 下载并渲染说明书二维码', async () => {
    const { container } = render(<GPSRLabelTab product={null}/>);
    for (const title of ['欧盟责任人 · EU REP', '制造商 · Manufacturer']) {
      const section = screen.getByRole('heading', { name: title }).closest('section')!;
      fireEvent.click(within(section).getByRole('button', { name: /填写资料|编辑详情/ }));
    }
    const values: Record<string, string> = {
      '商品原始品名': '蓝牙耳机',
      '罗马尼亚语 · RO': 'Căști Bluetooth',
      '保加利亚语 · BG': 'Bluetooth слушалки',
      '匈牙利语 · HU': 'Bluetooth fülhallgató',
      '产品编号': 'B003',
      'EU Postal Address': 'EU Street 1, Bucharest',
      'Production Address': 'Building 2, Shenzhen, China',
    };
    Object.entries(values).forEach(([label, value]) => fireEvent.change(screen.getByLabelText(label), { target: { value } }));
    const companyNames = screen.getAllByLabelText('Company Name');
    fireEvent.change(companyNames[0], { target: { value: 'EU Safety SRL' } });
    fireEvent.change(companyNames[1], { target: { value: 'Shenzhen Audio Co Ltd' } });
    const emails = screen.getAllByLabelText('Email');
    fireEvent.change(emails[0], { target: { value: 'safety@example.eu' } });
    fireEvent.change(emails[1], { target: { value: 'factory@example.cn' } });
    fireEvent.change(screen.getByLabelText(/说明书 \/ 安全声明 URL/), { target: { value: 'https://example.com/manual.pdf' } });

    const download = screen.getByRole('button', { name: /一键下载热敏打印 PDF/ });
    await waitFor(() => expect((download as HTMLButtonElement).disabled).toBe(false), {
      onTimeout: (error) => new Error(`${error.message}\n${[...container.querySelectorAll('[role="alert"]')].map((item) => item.textContent).join('\n')}`),
    });
    expect(container.querySelector('.gpsr-preview-paper image')?.getAttribute('xlink:href')).toMatch(/^data:image\/png;base64,/);
  });
});
