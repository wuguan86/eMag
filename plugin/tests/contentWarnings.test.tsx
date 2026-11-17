import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostId, startProductObserver } from '../src/content/controller';

const completeProduct = `<h1 class="page-title">已加载商品</h1><p class="product-new-price">159,99 Lei</p>
  <div id="product-gallery"><img src="https://images.example/main.jpg"></div>
  <div class="product-seller">Vândut de eMAG</div><div id="other-offers">Nu există alte oferte</div>`;

describe('加载与验证过程中的解析日志', () => {
  let cleanup: (() => void) | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    history.replaceState({}, '', '/product/pd/ABC123/');
    document.body.innerHTML = '';
  });
  afterEach(async () => {
    await act(async () => { cleanup?.(); });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  async function tick(milliseconds: number) { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); }
  async function setPage(html: string) { await act(async () => { document.body.innerHTML = html; }); }

  it('页面尚无商品内容时显示等待状态，只记录提示而不生成全字段错误告警', async () => {
    await setPage('<p>正在完成验证</p>');
    await act(async () => { cleanup = startProductObserver(''); });
    expect(document.getElementById(hostId)?.shadowRoot?.textContent).toContain('等待页面内容');
    await tick(5000);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledTimes(1);
    await setPage(completeProduct);
    await tick(2500);
    expect(console.warn).not.toHaveBeenCalled();
    expect(document.getElementById(hostId)?.shadowRoot?.textContent).toContain('已读取页面');
  });

  it('异步补齐字段之前保留宽限期，补齐后取消待发告警', async () => {
    await setPage('<h1 class="page-title">已加载商品</h1>');
    await act(async () => { cleanup = startProductObserver(''); });
    expect(console.warn).not.toHaveBeenCalled();
    await tick(1000);
    await setPage(completeProduct);
    await tick(2500);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('真正持续缺失的字段仍告警，且无关DOM更新不重复记录', async () => {
    await setPage('<h1 class="page-title">商品</h1><p class="product-new-price">159,99 Lei</p>');
    await act(async () => { cleanup = startProductObserver(''); });
    expect(console.warn).not.toHaveBeenCalled();
    await tick(2100);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenLastCalledWith('商品解析不全，请核对页面字段：', ['主图', '销售方', '其他报价数']);
    await act(async () => { document.body.append(document.createElement('span')); });
    await tick(2500);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('离开商品页时取消尚未发出的缺失告警', async () => {
    await setPage('<h1 class="page-title">商品</h1>');
    await act(async () => { cleanup = startProductObserver(''); });
    await act(async () => { history.pushState({}, '', '/search/test'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await tick(5000);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
  });
});
