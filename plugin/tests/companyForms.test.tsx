import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/components/LabelPreview', () => ({ LabelPreview: () => null }));
// 固定空联系方式场景，避免本地正式配置改变焦点循环和占位文案断言。
vi.mock('../src/config/feedback', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/config/feedback')>(),
  feedbackConfig: { email: '' },
}));
beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); localStorage.clear(); });
afterEach(async () => {
  cleanup();
  const { flushStorage } = await import('../src/storage/localStore');
  await flushStorage();
  vi.unstubAllGlobals();
});

describe('模板、法规参考和反馈交互', () => {
  it('只有一个模板时可重复应用所选模板，恢复所有临时微调字段', async () => {
    const { Toolkit } = await import('../src/components/Toolkit');
    render(<Toolkit product={null} popup/>);
    const rep = screen.getByRole('heading', { name: '欧盟责任人 · EU REP' }).closest('section')!;
    await waitFor(() => expect((within(rep).getByLabelText('EU REP 模板') as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(within(rep).getByLabelText('Company Name'), { target: { value: '保存名称' } });
    fireEvent.change(within(rep).getByLabelText('EU Postal Address'), { target: { value: '保存地址' } });
    fireEvent.change(within(rep).getByLabelText('新模板名称'), { target: { value: '唯一模板' } });
    fireEvent.click(within(rep).getByRole('button', { name: '保存为新模板' }));
    const selectedId = (within(rep).getByLabelText('EU REP 模板') as HTMLSelectElement).value;
    for (const adjustment of ['第一次微调', '第二次微调']) {
      fireEvent.change(within(rep).getByLabelText('Company Name'), { target: { value: adjustment } });
      fireEvent.change(within(rep).getByLabelText('EU Postal Address'), { target: { value: adjustment } });
      fireEvent.click(within(rep).getByRole('button', { name: '应用所选模板' }));
      expect((within(rep).getByLabelText('Company Name') as HTMLInputElement).value).toBe('保存名称');
      expect((within(rep).getByLabelText('EU Postal Address') as HTMLTextAreaElement).value).toBe('保存地址');
      expect((within(rep).getByLabelText('EU REP 模板') as HTMLSelectElement).value).toBe(selectedId);
    }
  });
  it('GPSR 三语标签草稿与 DoC 产品资料相互独立，标签设置在返回后保留', async () => {
    const { Toolkit } = await import('../src/components/Toolkit');
    render(<Toolkit product={null} popup/>);
    fireEvent.change(screen.getByLabelText('商品原始品名'), { target: { value: '标签商品' } });
    fireEvent.change(screen.getByLabelText('产品编号'), { target: { value: 'LABEL-1' } });
    expect(screen.getByText(/CE · 0–3 岁警示标志 · RO \/ BG \/ HU 塑料袋防窒息警示/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'DoC 草稿' }));
    expect((screen.getByLabelText('产品名称') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('产品名称'), { target: { value: 'DoC 商品' } });
    fireEvent.click(screen.getByRole('button', { name: 'GPSR 标签' }));
    expect((screen.getByLabelText('商品原始品名') as HTMLInputElement).value).toBe('标签商品');
    expect((screen.getByLabelText('产品编号') as HTMLInputElement).value).toBe('LABEL-1');
    expect(screen.getByText(/CE · 0–3 岁警示标志 · RO \/ BG \/ HU 塑料袋防窒息警示/)).toBeTruthy();
  });
  it('模板另存副本、切换、删除与默认指向相互独立，切 Tab 共享微调草稿', async () => {
    const { Toolkit } = await import('../src/components/Toolkit');
    render(<Toolkit product={null} popup/>);
    const rep = screen.getByRole('heading', { name: '欧盟责任人 · EU REP' }).closest('section')!;
    await waitFor(() => expect((within(rep).getByLabelText('EU REP 模板') as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(within(rep).getByLabelText('Company Name'), { target: { value: '第一公司' } });
    fireEvent.change(within(rep).getByLabelText('新模板名称'), { target: { value: '  常用  ' } });
    fireEvent.click(within(rep).getByRole('button', { name: '保存为新模板' }));
    expect(within(rep).getByRole('option', { name: '常用（默认）' })).toBeTruthy();
    fireEvent.change(within(rep).getByLabelText('Company Name'), { target: { value: '临时公司' } });
    fireEvent.click(screen.getByRole('button', { name: 'DoC 草稿' }));
    const docRep = screen.getByRole('heading', { name: '欧盟责任人 · EU REP' }).closest('section')!;
    expect((within(docRep).getByLabelText('公司名称') as HTMLInputElement).value).toBe('临时公司');
    fireEvent.change(within(docRep).getByLabelText('新模板名称'), { target: { value: '常用' } });
    fireEvent.click(within(docRep).getByRole('button', { name: '保存为新模板' }));
    expect(within(docRep).getByRole('alert').textContent).toContain('已存在');
    fireEvent.change(within(docRep).getByLabelText('新模板名称'), { target: { value: '另一份' } });
    fireEvent.click(within(docRep).getByRole('button', { name: '保存为新模板' }));
    const select = within(docRep).getByLabelText('EU REP 模板') as HTMLSelectElement;
    const firstId = within(docRep).getByRole('option', { name: '常用（默认）' }).getAttribute('value')!;
    fireEvent.change(select, { target: { value: firstId } });
    expect((within(docRep).getByLabelText('公司名称') as HTMLInputElement).value).toBe('第一公司');
    fireEvent.click(within(docRep).getByRole('button', { name: '删除模板' }));
    expect(select.value).toBe('');
    expect((within(docRep).getByLabelText('公司名称') as HTMLInputElement).value).toBe('第一公司');
    expect(within(docRep).queryByRole('option', { name: /默认/ })).toBeNull();
  });

  it('用户主动选择参考时只替换法规和标准，签署字段保持可编辑草稿', async () => {
    const { Toolkit } = await import('../src/components/Toolkit');
    render(<Toolkit product={null} popup/>);
    fireEvent.click(screen.getByRole('button', { name: 'DoC 草稿' }));
    fireEvent.change(screen.getByLabelText('签署人姓名'), { target: { value: '自行填写' } });
    fireEvent.change(screen.getByLabelText('插入常见品类法规参考示例（需自行核对）'), { target: { value: 'wireless' } });
    expect((screen.getByLabelText('适用法规') as HTMLTextAreaElement).value).toBe('2014/53/EU (RED), 2011/65/EU (RoHS)');
    expect((screen.getByLabelText('协调标准') as HTMLTextAreaElement).value).toBe('ETSI EN 300 328, EN 62368-1');
    expect((screen.getByLabelText('签署人姓名') as HTMLInputElement).value).toBe('自行填写');
  });

  it('反馈对话框聚焦、循环和 Esc 隔离后恢复触发焦点，并显示待配置联系信息', async () => {
    const { Toolkit } = await import('../src/components/Toolkit');
    const closeDrawer = vi.fn();
    const view = render(<div onKeyDown={(event) => { if (event.key === 'Escape') closeDrawer(); }}><Toolkit product={null} popup/></div>);
    const trigger = screen.getByRole('button', { name: '问题反馈 / 功能定制' });
    trigger.focus(); fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    const close = within(dialog).getByRole('button', { name: '关闭反馈' });
    expect(document.activeElement).toBe(close);
    expect(dialog.textContent).toContain('待配置');
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(closeDrawer).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    view.unmount();
  });
});

it('真实抽屉中的反馈 Esc 不关闭抽屉，随后 Esc 可正常收起抽屉', async () => {
  const { Drawer } = await import('../src/content/Drawer');
  const product = { productId: 'test', url: 'https://www.emag.ro/test/pd/TEST/', title: null, imageUrl: null, priceRon: null, sellerName: null, isEmagSeller: null, otherOfferCount: null, brandName: null, breadcrumbs: [], lowestOtherOfferRon: null, sources: {}, missingFields: [], capturedAt: 1 };
  render(<Drawer product={product}/>);
  const launcher = screen.getByRole('button', { name: '打开 eMAG 卖家工具箱' });
  fireEvent.click(launcher);
  const trigger = screen.getByRole('button', { name: '问题反馈 / 功能定制' });
  trigger.focus(); fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('button', { name: '关闭反馈' }), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(launcher.getAttribute('aria-expanded')).toBe('true');
  expect(document.activeElement).toBe(trigger);
  fireEvent.keyDown(trigger, { key: 'Escape' });
  expect(launcher.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(launcher);
});

it('Shadow DOM 中关闭反馈后恢复到内部触发按钮，并读取扩展版本', async () => {
  vi.stubGlobal('chrome', { runtime: { getManifest: () => ({ version: '9.8.7' }) } });
  const { Toolkit } = await import('../src/components/Toolkit');
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const container = document.createElement('div');
  shadow.append(container);
  const view = render(<Toolkit product={null} popup/>, { container });
  const trigger = within(container).getByRole('button', { name: '问题反馈 / 功能定制' });
  trigger.focus(); fireEvent.click(trigger);
  const dialog = within(container).getByRole('dialog');
  expect(dialog.textContent).toContain('9.8.7');
  fireEvent.keyDown(within(dialog).getByRole('button', { name: '关闭反馈' }), { key: 'Escape' });
  expect(shadow.activeElement).toBe(trigger);
  view.unmount(); host.remove();
});
