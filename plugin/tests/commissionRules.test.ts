import { describe, expect, it } from 'vitest';
import { matchCommission, marketVatRates } from '../src/config/commissionRules';

describe('可配置类目费率', () => {
  it.each([
    [['Fashion', 'Încălțăminte bărbați', 'Ghete bărbați'], 0.17],
    [['Sport & Travel', 'Imbracaminte sport', 'Hanorace sport dama Columbia'], 0.17],
    [['Electronice', 'Telefoane mobile'], 0.10],
    [['Electronice', 'Laptopuri'], 0.12],
    [['Casa si gradina'], 0.14], [['Frumusețe și îngrijire'], 0.16],
    [['Necunoscut'], 0.16], [null, 0.16],
  ] as const)('识别面包屑 %j', (breadcrumbs, rate) => {
    expect(matchCommission(breadcrumbs).rate).toBe(rate);
  });
  it('使用约定的三站VAT参考值', () => {
    expect(marketVatRates).toEqual({ RO: 0.21, HU: 0.27, BG: 0.20 });
  });
});
