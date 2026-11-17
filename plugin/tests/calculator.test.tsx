import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProfitCalculator } from '../src/components/ProfitCalculator';
import type { ProductSnapshot } from '../src/types';

const product: ProductSnapshot = { productId: 'FORMTEST', url: 'https://www.emag.ro/test/pd/FORMTEST/', title: '测试商品', imageUrl: null, priceRon: 129.99, sellerName: '商户', isEmagSeller: false, otherOfferCount: null, brandName: null, breadcrumbs: null, lowestOtherOfferRon: null, sources: {}, missingFields: ['imageUrl', 'otherOfferCount'], capturedAt: 0 };
afterEach(cleanup);

describe('利润面板提交与校验', () => {
  it('采购成本只在失焦时提交，无效成本不能通过切换运费绕过', () => {
    const { container } = render(<ProfitCalculator product={product}/>);
    const procurement = screen.getByLabelText('采购成本');
    fireEvent.focus(procurement); fireEvent.change(procurement, { target: { value: '30' } });
    expect(container.querySelector('.profit-result.pending')).not.toBeNull();
    fireEvent.blur(procurement);
    expect(container.querySelector('.profit-result.high')).not.toBeNull();
    fireEvent.focus(procurement); fireEvent.change(procurement, { target: { value: '-5' } }); fireEvent.blur(procurement);
    expect(container.querySelector('.profit-result.pending')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('头程计费'), { target: { value: 'weight' } });
    fireEvent.change(screen.getByLabelText('头程计费'), { target: { value: 'fixed' } });
    expect(container.querySelector('.profit-result.pending')).not.toBeNull();
  });

  it('切站点更新VAT，手调后普通重渲染不覆盖，切FBE载入参考当地费', () => {
    const view = render(<ProfitCalculator product={{ ...product, productId: 'SITETEST' }}/>);
    fireEvent.change(screen.getByLabelText('VAT 参考站点'), { target: { value: 'HU' } });
    expect((screen.getByLabelText('VAT 税率') as HTMLInputElement).value).toBe('27');
    const vat = screen.getByLabelText('VAT 税率');
    fireEvent.focus(vat); fireEvent.change(vat, { target: { value: '5' } }); fireEvent.blur(vat);
    view.rerender(<ProfitCalculator product={{ ...product, productId: 'SITETEST', title: '更新标题' }}/>);
    expect((screen.getByLabelText('VAT 税率') as HTMLInputElement).value).toBe('5');
    fireEvent.change(screen.getByLabelText('履约模式'), { target: { value: 'fbe' } });
    expect((screen.getByLabelText('FBE / 当地费用') as HTMLInputElement).value).toBe('15');
  });

  it('按类目匹配佣金，手调不受异步类目变化影响，支持恢复自动', () => {
    const current = { ...product, productId: 'COMMISSIONTEST', breadcrumbs: ['Fashion', 'Ghete barbati'] };
    const view = render(<ProfitCalculator product={current}/>);
    expect((screen.getByLabelText('平台佣金率') as HTMLInputElement).value).toBe('17');
    const commission = screen.getByLabelText('平台佣金率');
    fireEvent.focus(commission); fireEvent.change(commission, { target: { value: '13' } }); fireEvent.blur(commission);
    view.rerender(<ProfitCalculator product={{ ...current, breadcrumbs: ['Telefoane mobile'] }}/>);
    expect((screen.getByLabelText('平台佣金率') as HTMLInputElement).value).toBe('13');
    fireEvent.click(screen.getByRole('button', { name: '恢复类目匹配' }));
    expect((screen.getByLabelText('平台佣金率') as HTMLInputElement).value).toBe('10');
  });

  it('展示品牌与自营风险，并从最低报价填价、修正之前的无效售价', () => {
    render(<ProfitCalculator product={{ ...product, productId: 'RISKTEST', sellerName: 'eMaG', isEmagSeller: true, brandName: 'Columbia', lowestOtherOfferRon: 99.9 }}/>);
    expect(screen.getByText('eMAG 自营（跟卖高风险）')).toBeTruthy();
    expect(screen.getByText('品牌商品（Columbia），跟卖需品牌授权')).toBeTruthy();
    const sale = screen.getByLabelText('销售价');
    fireEvent.focus(sale); fireEvent.change(sale, { target: { value: '-1' } }); fireEvent.blur(sale);
    fireEvent.click(screen.getByRole('button', { name: /最低报价: 99.90 RON/ }));
    expect((screen.getByLabelText('销售价') as HTMLInputElement).value).toBe('99.9');
    expect(screen.getByLabelText('销售价').getAttribute('aria-invalid')).toBe('false');
  });
});
