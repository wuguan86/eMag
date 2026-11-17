import { describe, expect, it } from 'vitest';
import { calculateProfit, defaultProfitSettings } from '../src/utils/profit';

describe('含当地费用与结汇损耗的真实回款', () => {
  const input = { ...defaultProfitSettings, priceRon: 100, procurementRmb: 50,
    fulfillmentMode: 'fbe' as const, localFeeRon: 15, settlementLossRate: 0.015,
    smallOrderThresholdRon: 250, includeSmallOrderFee: true };

  it('逐项扣含税VAT、佣金和小额费、当地费用，再扣结汇损耗', () => {
    const result = calculateProfit(input)!;
    const vat = 100 - 100 / 1.21;
    const netRemittance = (100 - vat - 18 - 15) * 1.58 * 0.985;
    expect(result.vatRon).toBeCloseTo(vat);
    expect(result.commissionRon).toBeCloseTo(18);
    expect(result.smallOrderFeeRate).toBe(0.02);
    expect(result.localFeeRon).toBe(15);
    expect(result.netRemittanceRmb).toBeCloseTo(netRemittance);
    expect(result.netProfitRmb).toBeCloseTo(netRemittance - 62);
    expect(result.marginPercent).toBeCloseTo((netRemittance - 62) / 158 * 100);
  });

  it.each([249.99, 250, 250.01])('小额费只在售价严格低于门槛时生效：%s', (priceRon) => {
    expect(calculateProfit({ ...input, priceRon })?.smallOrderFeeRate).toBe(priceRon < 250 ? 0.02 : 0);
  });

  it('未勾选时不收小额费，FBM可使用其编辑后的当地费用', () => {
    const result = calculateProfit({ ...input, fulfillmentMode: 'fbm', localFeeRon: 0, includeSmallOrderFee: false });
    expect(result?.smallOrderFeeRate).toBe(0);
    expect(result?.localFeeRon).toBe(0);
  });

  it.each([{ localFeeRon: -1 }, { settlementLossRate: 1.1 }, { settlementLossRate: -0.01 },
    { smallOrderThresholdRon: 0 }, { localFeeRon: Infinity }, { settlementLossRate: NaN }, { commissionRate: 0.99 }])('拒绝非法费用组合 %j', (patch) => {
    expect(calculateProfit({ ...input, ...patch })).toBeNull();
  });
});
