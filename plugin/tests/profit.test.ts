import { describe, expect, it } from 'vitest';
import { calculateProfit, defaultProfitSettings } from '../src/utils/profit';
import type { ProfitInput } from '../src/types';

const validInput: ProfitInput = { ...defaultProfitSettings, priceRon: 100, procurementRmb: 50, settlementLossRate: 0 };

describe('利润计算', () => {
  it('按含税销售额扣除 VAT、佣金、采购及运费', () => {
    const result = calculateProfit(validInput);
    expect(result?.netProfitRmb).toBeCloseTo(43.2991735537);
    expect(result?.marginPercent).toBeCloseTo(27.4045402239);
    expect(result?.shippingRmb).toBe(12);
    expect(result?.status).toBe('high');
  });

  it('允许零采购并使用重量运费', () => {
    const result = calculateProfit({ ...validInput, procurementRmb: 0, shippingMode: 'weight', weightKg: 2.5, ratePerKg: 8 });
    expect(result?.shippingRmb).toBe(20);
    expect(result?.netProfitRmb).toBeCloseTo(85.2991735537);
  });

  it('使用可配置税率、汇率和佣金，并以20%为高利边界', () => {
    const input = { ...validInput, exchangeRate: 1, vatRate: 0, commissionRate: 0, shippingRmb: 0 };
    expect(calculateProfit({ ...input, procurementRmb: 80 })?.status).toBe('high');
    expect(calculateProfit({ ...input, procurementRmb: 80.01 })?.status).toBe('low');
    expect(calculateProfit({ ...input, procurementRmb: 100 })?.status).toBe('low');
    expect(calculateProfit({ ...input, procurementRmb: 101 })?.status).toBe('loss');
  });

  it.each([
    { procurementRmb: null }, { priceRon: null }, { priceRon: 0 },
    { procurementRmb: -1 }, { priceRon: -1 }, { exchangeRate: 0 },
    { vatRate: -0.1 }, { vatRate: 1.1 }, { commissionRate: 1.1 },
    { shippingRmb: -1 }, { procurementRmb: Number.NaN }, { exchangeRate: Infinity },
    { shippingMode: 'weight' as const, weightKg: null, ratePerKg: 1 },
    { shippingMode: 'weight' as const, weightKg: -1, ratePerKg: 1 },
    { shippingMode: 'weight' as const, weightKg: 1, ratePerKg: Infinity },
  ])('拒绝缺失或不合法输入 %j', (invalid) => {
    expect(calculateProfit({ ...validInput, ...invalid })).toBeNull();
  });

  it('拒绝运算溢出的结果', () => {
    expect(calculateProfit({ ...validInput, priceRon: Number.MAX_VALUE })).toBeNull();
  });
});
