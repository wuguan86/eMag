export type ProductField = 'title' | 'imageUrl' | 'priceRon' | 'sellerName' | 'otherOfferCount';
export type ProductMetadataField = 'brandName' | 'breadcrumbs' | 'lowestOtherOfferRon';
export type ProductDataField = ProductField | ProductMetadataField;

export interface ProductSnapshot {
  productId: string;
  url: string;
  title: string | null;
  imageUrl: string | null;
  priceRon: number | null;
  sellerName: string | null;
  isEmagSeller: boolean | null;
  otherOfferCount: number | null;
  brandName: string | null;
  breadcrumbs: string[] | null;
  lowestOtherOfferRon: number | null;
  sources: Partial<Record<ProductDataField, string>>;
  missingFields: ProductField[];
  capturedAt: number;
}

export interface ProfitSettings {
  exchangeRate: number;
  vatRate: number;
  commissionRate: number;
  shippingMode: 'fixed' | 'weight';
  shippingRmb: number;
  weightKg: number | null;
  ratePerKg: number | null;
  market: 'RO' | 'HU' | 'BG';
  fulfillmentMode: 'fbm' | 'fbe';
  localFeeRon: number;
  settlementLossRate: number;
  smallOrderThresholdRon: number;
  includeSmallOrderFee: boolean;
}

export interface ProfitInput extends ProfitSettings {
  priceRon: number | null;
  procurementRmb: number | null;
}

export interface ProfitResult {
  netProfitRmb: number;
  marginPercent: number;
  shippingRmb: number;
  vatRon: number;
  commissionRon: number;
  smallOrderFeeRate: number;
  localFeeRon: number;
  settlementLossRmb: number;
  netRemittanceRmb: number;
  status: 'high' | 'low' | 'loss';
}

export type ComplianceIcon = 'ce' | 'weee' | 'age' | 'triman' | 'pap20';
export type LabelSize = '50x30' | '70x40' | '100x100';
export type GpsrLabelSize = '70x80' | '80x80' | '100x100' | 'custom';
export type GpsrLabelOrientation = 0 | 90;
export type GpsrMaterialId = 'plastic' | 'silicone' | 'metal' | 'stainlessSteel' | 'textile' | 'wood';
export type GpsrWarningId = 'none' | 'choking' | 'fire';

export interface LocalizedText { zh: string; ro: string; bg: string; hu: string }
export type ProductNameLanguage = 'zh-CN' | 'ro' | 'bg' | 'hu' | 'en';
export interface ProductNameSource { text: string; language: ProductNameLanguage | '' }

export interface GpsrLabelDraft {
  productName: LocalizedText;
  productNameSource?: ProductNameSource;
  productNameRevision?: string;
  material: GpsrMaterialId | '';
  model: string;
  productSize?: string;
  batch: string;
  ean13: string;
  manualUrl: string;
  labelSize: GpsrLabelSize;
  customWidth: number;
  customHeight: number;
  orientation: GpsrLabelOrientation;
  icons: Exclude<ComplianceIcon, 'pap20'>[];
  warningId: GpsrWarningId;
}

export interface GpsrLabelData {
  draft: GpsrLabelDraft;
  euRep: Company;
  manufacturer: Company;
}

export interface Company {
  name: string;
  address: string;
  email: string;
  phone: string;
}

export interface ComplianceProfile {
  productName: string;
  model: string;
  batch: string;
  euRep: Company;
  manufacturer: Company;
  warningId: string;
  customWarning?: string;
  icons: ComplianceIcon[];
  labelSize: LabelSize;
}

export interface DeclarationDraft {
  description: string;
  legislation: string;
  standards: string;
  place: string;
  date: string;
  signatory: string;
  position: string;
}

export interface StoredState {
  schemaVersion: 1;
  profit: ProfitSettings;
  profile: ComplianceProfile;
  declaration: DeclarationDraft;
}
