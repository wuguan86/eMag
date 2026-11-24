import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultGpsrLabelDraft } from '../src/utils/gpsrLabel';
import type { ProductSnapshot } from '../src/types';

beforeEach(() => { vi.resetModules(); localStorage.clear(); vi.unstubAllGlobals(); });
afterEach(async () => {
  cleanup();
  const { flushStorage } = await import('../src/storage/localStore');
  await flushStorage();
  vi.unstubAllGlobals();
});

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const change = (label: string, value: string) => fireEvent.change(input(label), { target: { value } });
const product: ProductSnapshot = {
  productId: 'P2', url: 'https://www.emag.ro/salopeta/pd/P2/', title: 'Salopeta de schi femei',
  imageUrl: null, priceRon: null, sellerName: null, isEmagSeller: null, otherOfferCount: null,
  brandName: null, breadcrumbs: null, lowestOtherOfferRon: null, sources: {}, missingFields: [], capturedAt: 0,
};
async function mountWithOldNames(currentProduct = product) {
  localStorage.setItem('emag:v1:gpsrLabel.draft', JSON.stringify({ schemaVersion: 1, value: {
    ...createDefaultGpsrLabelDraft(), productName: { zh: '旧公司', ro: 'Old Company', bg: 'Old Company', hu: 'Old Company' },
  } }));
  const { GPSRLabelTab } = await import('../src/components/GPSRLabelTab');
  const view = render(<GPSRLabelTab product={currentProduct}/>);
  await waitFor(() => expect(input('罗马尼亚语 · RO').value).toBe('Old Company'));
  return view;
}
function deferredTranslation() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  stubNameService(async ({ type }) => {
    if (type === 'REFINE_GPSR_NAME') return { ok: false, error: '提炼服务暂不可用。' };
    await gate;
    return { ok: true, data: { zh: '旧译文', ro: 'Traducere veche', bg: 'Стар превод', hu: 'Régi fordítás' } };
  });
  return release;
}

function stubNameService(sendMessage: (message: { type: string; name: string; sourceLanguage: string | null }) => Promise<unknown>) {
  vi.stubGlobal('chrome', { ...globalThis.chrome, runtime: { sendMessage } });
}

describe('GPSR 品名与译文关联', () => {
  it('保留完整原标题，提炼后使用可编辑的短品名翻译', async () => {
    const sendMessage = vi.fn(async (message: { type: string }) => message.type === 'REFINE_GPSR_NAME'
      ? { ok: true, data: { name: 'Salopetă de schi' } }
      : { ok: true, data: { zh: '滑雪服', ro: 'Salopetă', bg: 'Ски костюм', hu: 'Síruha' } });
    stubNameService(sendMessage);
    await mountWithOldNames();
    fireEvent.click(screen.getByRole('button', { name: '从当前商品导入' }));
    await waitFor(() => expect(input('短品名').value).toBe('Salopetă de schi'));
    expect(input('商品原始品名').value).toBe(product.title);
    change('短品名', 'Salopetă');
    fireEvent.click(screen.getByRole('button', { name: '翻译并生成三语品名' }));
    await waitFor(() => expect(input('中文品名').value).toBe('滑雪服'));
    expect(sendMessage).toHaveBeenCalledWith({ type: 'TRANSLATE_GPSR_NAME', name: 'Salopetă', sourceLanguage: 'ro' });
  });

  it('自动提炼失败后保留原标题和语言，可以重新提炼', async () => {
    const sendMessage = vi.fn().mockResolvedValueOnce({ ok: false, error: '提炼服务暂不可用，请稍后重试。' })
      .mockResolvedValueOnce({ ok: true, data: { name: 'Salopetă' } });
    stubNameService(sendMessage);
    await mountWithOldNames();
    fireEvent.click(screen.getByRole('button', { name: '从当前商品导入' }));
    await screen.findByText(/提炼服务暂不可用/);
    expect(input('商品原始品名').value).toBe(product.title);
    expect(input('原文语言').value).toBe('ro');
    expect(input('短品名').value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: '提炼品名' }));
    await waitFor(() => expect(input('短品名').value).toBe('Salopetă'));
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('长标题完整保留，编辑中文结果独立于原标题和短品名', async () => {
    const title = '80-200斤吊带螺纹背心女大码修身外穿内搭打底衫无袖薄厂家直销'.repeat(8);
    const sendMessage = vi.fn(async () => ({ ok: true, data: { name: '女士罗纹吊带背心' } }));
    stubNameService(sendMessage);
    await mountWithOldNames({ ...product, title, url: 'https://detail.1688.com/offer/123.html' });
    fireEvent.click(screen.getByRole('button', { name: '从当前商品导入' }));
    await waitFor(() => expect(input('短品名').value).toBe('女士罗纹吊带背心'));
    expect(input('商品原始品名').value).toBe(title);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'REFINE_GPSR_NAME', name: title, sourceLanguage: 'zh-CN' });
    change('中文品名', '女士背心');
    expect(input('商品原始品名').value).toBe(title);
    expect(input('短品名').value).toBe('女士罗纹吊带背心');
  });

  it('提炼期间手填短品名后丢弃迟到结果', async () => {
    let release!: (result: unknown) => void;
    const sendMessage = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    stubNameService(sendMessage);
    await mountWithOldNames();
    fireEvent.click(screen.getByRole('button', { name: '从当前商品导入' }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    change('短品名', '品名由用户填写');
    await act(async () => { release({ ok: true, data: { name: 'Salopetă' } }); });
    expect(input('短品名').value).toBe('品名由用户填写');
  });
  it('导入 RO 标题后清除旧公司译文且不把原文冒充中文对照', async () => {
    await mountWithOldNames();
    fireEvent.click(screen.getByRole('button', { name: '从当前商品导入' }));
    await waitFor(() => expect(input('商品原始品名').value).toBe('Salopeta de schi femei'));
    expect(input('原文语言').value).toBe('ro');
    expect(input('中文品名').value).toBe('');
    expect(input('罗马尼亚语 · RO').value).toBe('Salopeta de schi femei');
    expect(input('保加利亚语 · BG').value).toBe('');
    expect(input('匈牙利语 · HU').value).toBe('');
    expect(screen.queryByText(/中文对照：Salopeta/)).toBeNull();
    expect((screen.getByRole('button', { name: /一键下载热敏打印 PDF/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('修改原文或语言时立即使旧译文失效', async () => {
    await mountWithOldNames();
    change('商品原始品名', '新商品');
    expect(input('中文品名').value).toBe('新商品');
    expect(input('罗马尼亚语 · RO').value).toBe('');
    change('保加利亚语 · BG', 'Ръчно име');
    change('原文语言', 'en');
    expect(input('中文品名').value).toBe('');
    expect(input('保加利亚语 · BG').value).toBe('');
  });

  it('中文语言下粘贴纯外文时不把它显示成中文对照', async () => {
    await mountWithOldNames();
    change('商品原始品名', 'Salopeta de schi femei');
    expect(input('中文品名').value).toBe('');
    expect(screen.queryByText(/中文对照：Salopeta/)).toBeNull();
  });

  it('外文翻译成功后中文对照使用真正中文译文', async () => {
    await mountWithOldNames();
    fireEvent.click(screen.getByRole('button', { name: '从当前商品导入' }));
    await waitFor(() => expect(input('商品原始品名').value).toBe(product.title));
    stubNameService(async () => ({ ok: true, data: { zh: '女士滑雪服', ro: product.title, bg: 'Дамски ски костюм', hu: 'Női síruha' } }));
    fireEvent.click(screen.getByRole('button', { name: '翻译并生成三语品名' }));
    await waitFor(() => expect(input('中文品名').value).toBe('女士滑雪服'));
    expect(screen.getAllByText('中文对照：女士滑雪服')).toHaveLength(3);
  });

  it.each(['修改原文', '修改短品名', '清空重填', '手改译文', '导入商品', '修改语言', '原文改回'])('翻译进行中%s后迟到结果不得覆盖表单', async (action) => {
    await mountWithOldNames();
    const release = deferredTranslation();
    fireEvent.click(screen.getByRole('button', { name: '翻译并生成三语品名' }));
    await screen.findByText('正在请求翻译…');
    if (action === '修改原文') change('商品原始品名', '新商品');
    if (action === '修改短品名') change('短品名', 'Maiou');
    if (action === '清空重填') fireEvent.click(screen.getByRole('button', { name: action }));
    if (action === '手改译文') change('罗马尼亚语 · RO', '手工品名');
    if (action === '修改语言') change('原文语言', 'en');
    if (action === '原文改回') {
      change('商品原始品名', '临时原文');
      change('商品原始品名', '旧公司');
    }
    if (action === '导入商品') {
      fireEvent.click(screen.getByRole('button', { name: '从当前商品导入' }));
      await waitFor(() => expect(input('商品原始品名').value).toBe(product.title));
    }
    await act(async () => { release(); });
    await waitFor(() => expect(screen.queryByRole('button', { name: '正在翻译…' })).toBeNull());
    expect(input('罗马尼亚语 · RO').value).toBe(action === '手改译文' ? '手工品名' : action === '导入商品' ? product.title : '');
    expect(input('保加利亚语 · BG').value).not.toBe('旧译文');
  });

  it('单个语言请求失败时不部分写入其它成功译文', async () => {
    await mountWithOldNames();
    stubNameService(async () => ({ ok: true, data: { zh: '部分译文', ro: 'Traducere parțială', bg: 'Частичен превод' } }));
    fireEvent.click(screen.getByRole('button', { name: '翻译并生成三语品名' }));
    await screen.findByText(/翻译结果格式无效/);
    expect(input('罗马尼亚语 · RO').value).toBe('Old Company');
    expect(input('保加利亚语 · BG').value).toBe('Old Company');
    expect(input('匈牙利语 · HU').value).toBe('Old Company');
  });

  it.each(['保存回声', '另一窗口只改尺寸'])('Chrome %s先到时不应拒绝内容未编辑的慢翻译', async (event) => {
    let receive: ((changes: Record<string, { newValue: unknown }>, area: string) => void) | undefined;
    const echoes: Record<string, { newValue: unknown }> = {};
    vi.stubGlobal('chrome', { storage: {
      local: {
        get: async (key: string) => ({ [key]: JSON.parse(localStorage.getItem(key) ?? 'null') }),
        set: async (values: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(values)) {
            localStorage.setItem(key, JSON.stringify(value));
            echoes[key] = { newValue: structuredClone(value) };
          }
        },
      }, onChanged: { addListener: (listener: typeof receive) => { receive = listener; } },
    } });
    await mountWithOldNames();
    change('商品原始品名', '新商品');
    const release = deferredTranslation();
    fireEvent.click(screen.getByRole('button', { name: '翻译并生成三语品名' }));
    const { flushStorage } = await import('../src/storage/localStore');
    await act(async () => { await flushStorage(); });
    if (event === '另一窗口只改尺寸') {
      const stored = echoes['emag:v1:gpsrLabel.draft'].newValue as { value: { labelSize: string } };
      stored.value.labelSize = '100x100';
    }
    await act(async () => { receive?.(echoes, 'local'); });
    await act(async () => { release(); });
    await waitFor(() => expect(input('罗马尼亚语 · RO').value).toBe('Traducere veche'));
    expect(input('商品原始品名').value).toBe('新商品');
    if (event === '另一窗口只改尺寸') expect(input('打印尺寸').value).toBe('100x100');
  });

  it('旧版误存于中文字段的外文移至原文并清除无来源依据的译文', async () => {
    localStorage.setItem('emag:v1:gpsrLabel.draft', JSON.stringify({ schemaVersion: 1, value: {
      ...createDefaultGpsrLabelDraft(), productName: { zh: 'Salopeta de schi femei', ro: 'Old Company', bg: 'Old Company', hu: 'Old Company' },
    } }));
    const { GPSRLabelTab } = await import('../src/components/GPSRLabelTab');
    render(<GPSRLabelTab product={null}/>);
    await waitFor(() => expect(input('商品原始品名').value).toBe('Salopeta de schi femei'));
    expect(input('中文品名').value).toBe('');
    expect(input('原文语言').value).toBe('');
    expect(input('罗马尼亚语 · RO').value).toBe('');
  });
});
