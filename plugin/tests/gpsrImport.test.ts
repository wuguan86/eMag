import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCurrentProductTitle } from '../src/utils/productImport';

afterEach(() => vi.unstubAllGlobals());

describe('GPSR 当前商品导入', () => {
  it('只在支持的商品站点通过活动标签页读取标题', async () => {
    const executeScript = vi.fn(async () => [{ result: '  Wireless Earbuds  ' }]);
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn(async () => [{ id: 24, url: 'https://detail.1688.com/offer/123.html' }]) },
      scripting: { executeScript },
    });

    await expect(readCurrentProductTitle(null)).resolves.toBe('Wireless Earbuds');
    expect(executeScript).toHaveBeenCalledTimes(1);
  });

  it('对不支持的站点不执行页面脚本', async () => {
    const executeScript = vi.fn();
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn(async () => [{ id: 24, url: 'https://example.com/product' }]) },
      scripting: { executeScript },
    });

    await expect(readCurrentProductTitle(null)).rejects.toThrow('请在 eMAG 或 1688 商品页');
    expect(executeScript).not.toHaveBeenCalled();
  });
});
