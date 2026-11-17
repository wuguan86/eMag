import type { ProfitInput, ProfitResult, ProfitSettings } from '../types';

export const defaultProfitSettings: ProfitSettings = {
  exchangeRate: 1.58, vatRate: 0.21, commissionRate: 0.16,
  shippingMode: 'fixed', shippingRmb: 12, weightKg: null, ratePerKg: null,
  market: 'RO', fulfillmentMode: 'fbm', localFeeRon: 0,
  settlementLossRate: 0.015, smallOrderThresholdRon: 250, includeSmallOrderFee: false,
};

function isNonNegative(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function calculateProfit(input: ProfitInput): ProfitResult | null {
  if (!isNonNegative(input.priceRon) || input.priceRon === 0 ||
      !isNonNegative(input.procurementRmb) || !isNonNegative(input.exchangeRate) || input.exchangeRate === 0 ||
      !isNonNegative(input.vatRate) || input.vatRate > 1 ||
      !isNonNegative(input.commissionRate) || input.commissionRate > 1) return null;
  if (!['fbm', 'fbe'].includes(input.fulfillmentMode) || !['RO', 'HU', 'BG'].includes(input.market)
      || !isNonNegative(input.localFeeRon) || !isNonNegative(input.settlementLossRate) || input.settlementLossRate > 1
      || !isNonNegative(input.smallOrderThresholdRon) || input.smallOrderThresholdRon === 0
      || typeof input.includeSmallOrderFee !== 'boolean') return null;
  const smallOrderFeeRate = input.includeSmallOrderFee && input.priceRon < input.smallOrderThresholdRon ? 0.02 : 0;
  if (input.commissionRate + smallOrderFeeRate > 1) return null;

  let shippingRmb: number;
  if (input.shippingMode === 'fixed' && isNonNegative(input.shippingRmb)) shippingRmb = input.shippingRmb;
  else if (input.shippingMode === 'weight' && isNonNegative(input.weightKg) && isNonNegative(input.ratePerKg)) {
    shippingRmb = input.weightKg * input.ratePerKg;
  } else return null;

  // 前台售价含税；先在RON中扣税及平台费用，再结汇，最后扣人民币采购与头程成本。
  const grossRevenueRmb = input.priceRon * input.exchangeRate;
  const vatRon = input.priceRon - input.priceRon / (1 + input.vatRate);
  const commissionRon = input.priceRon * (input.commissionRate + smallOrderFeeRate);
  const beforeSettlementRmb = (input.priceRon - vatRon - commissionRon - input.localFeeRon) * input.exchangeRate;
  const settlementLossRmb = beforeSettlementRmb * input.settlementLossRate;
  const netRemittanceRmb = beforeSettlementRmb * (1 - input.settlementLossRate);
  const netProfitRmb = netRemittanceRmb - input.procurementRmb - shippingRmb;
  const marginPercent = netProfitRmb / grossRevenueRmb * 100;
  if (![shippingRmb, grossRevenueRmb, vatRon, commissionRon, beforeSettlementRmb,
    settlementLossRmb, netRemittanceRmb, netProfitRmb, marginPercent].every(Number.isFinite)) return null;
  return { netProfitRmb, marginPercent, shippingRmb, vatRon, commissionRon, smallOrderFeeRate,
    localFeeRon: input.localFeeRon, settlementLossRmb, netRemittanceRmb,
    status: netProfitRmb < 0 ? 'loss' : marginPercent >= 20 ? 'high' : 'low' };
}
