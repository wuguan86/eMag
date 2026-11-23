import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCurrentProductName } from '../src/utils/productImport';

afterEach(() => {
  vi.unstubAllGlobals();
  document.title = '';
  document.body.replaceChildren();
});

describe('GPSR 当前商品导入', () => {
  it('只在支持的商品站点通过活动标签页读取标题', async () => {
    const executeScript = vi.fn(async () => [{ result: '  Wireless Earbuds  ' }]);
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn(async () => [{ id: 24, url: 'https://detail.1688.com/offer/123.html' }]) },
      scripting: { executeScript },
    });

    await expect(readCurrentProductName(null)).resolves.toEqual({ text: 'Wireless Earbuds', language: '' });
    expect(executeScript).toHaveBeenCalledTimes(1);
  });

  it('导入 1688 商品标题并去掉站点后缀', async () => {
    const productTitle = '适用苹果17promax手机壳新款iPhone17磨砂14plus保护套13轻薄散热';
    document.title = `${productTitle} - 阿里巴巴`;
    document.body.innerHTML = `<h1>深圳市亿云帆科技有限公司</h1><div>${productTitle}</div>`;
    vi.stubGlobal('chrome', {
      tabs: { query: async () => [{ id: 24, url: 'https://detail.1688.com/offer/1061795557510.html?sourceId=test' }] },
      scripting: { executeScript: async ({ func }: { func: () => string }) => [{ result: func() }] },
    });

    await expect(readCurrentProductName(null)).resolves.toEqual({ text: productTitle, language: 'zh-CN' });
  });

  it('1688 商品页只有站点标题时报告没有可导入的标题', async () => {
    document.title = '阿里巴巴';
    document.body.innerHTML = '<h1>深圳市亿云帆科技有限公司</h1>';
    vi.stubGlobal('chrome', {
      tabs: { query: async () => [{ id: 24, url: 'https://detail.1688.com/offer/123.html' }] },
      scripting: { executeScript: async ({ func }: { func: () => string }) => [{ result: func() }] },
    });

    await expect(readCurrentProductName(null)).rejects.toThrow('当前商品页面没有可导入的标题。');
  });

  it('对不支持的站点不执行页面脚本', async () => {
    const executeScript = vi.fn();
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn(async () => [{ id: 24, url: 'https://example.com/product' }]) },
      scripting: { executeScript },
    });

    await expect(readCurrentProductName(null)).rejects.toThrow('请在 eMAG 或 1688 商品页');
    expect(executeScript).not.toHaveBeenCalled();
  });
});
