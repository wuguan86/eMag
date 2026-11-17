import type { ComplianceProfile, DeclarationDraft } from '../src/types';

export const sampleProfile: ComplianceProfile = {
  productName: '灯具 Șurubelniță', model: 'AB-12', batch: '2026-01',
  euRep: { name: 'EU SRL', address: 'Str. Unirii 1, București, RO', email: 'eu@example.ro', phone: '' },
  manufacturer: { name: '深圳公司', address: '广东深圳市南山区 10 号', email: 'factory@example.cn', phone: '' },
  warningId: 'none', icons: ['ce', 'weee', 'age', 'triman'], labelSize: '70x40',
};

export const sampleDraft: DeclarationDraft = {
  description: 'Portable lamp', legislation: 'Enter applicable legislation manually.', standards: 'EN test standard',
  place: 'București', date: '2026-11-12', signatory: '张三', position: 'Director',
};

export const compactProfile: ComplianceProfile = {
  ...sampleProfile, productName: 'Portable lamp for home and office', model: 'L1', batch: '2026',
  euRep: { name: 'EU SRL', address: 'București, RO', email: 'eu@ex.ro', phone: '' },
  manufacturer: { name: 'Factory', address: 'Shenzhen, CN', email: 'f@ex.cn', phone: '' },
  icons: ['ce', 'weee', 'age', 'triman', 'pap20'],
};

export const labelSamples: { name: string; profile: ComplianceProfile; expectedValid: boolean }[] = [
  ...(['50x30', '70x40', '100x100'] as const).map((labelSize) => ({
    name: `label-${labelSize}`, expectedValid: true,
    profile: { ...sampleProfile, labelSize, icons: labelSize === '50x30' ? ['ce' as const] : sampleProfile.icons, warningId: labelSize === '100x100' ? 'choking' : 'none' },
  })),
  ...['general', 'electronics', 'under3', 'textile'].map((warningId) => ({
    name: `label-${warningId}-70x40`, profile: { ...compactProfile, warningId }, expectedValid: true,
  })),
  { name: 'label-custom-70x40', profile: { ...compactProfile, warningId: 'custom', customWarning: 'RO: Atenție! EN: Keep <away> & safe. 中文仅用于提示验收' }, expectedValid: true },
  { name: 'label-five-icons-100x100', profile: { ...compactProfile, labelSize: '100x100' }, expectedValid: true },
  { name: 'overflow-five-icons-50x30', profile: { ...compactProfile, labelSize: '50x30', warningId: 'general' }, expectedValid: false },
  { name: 'overflow-custom-70x40', profile: { ...compactProfile, warningId: 'custom', customWarning: '完整长警示 EN: Warning. '.repeat(300) }, expectedValid: false },
];
