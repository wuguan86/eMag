import type { GpsrLabelDraft, GpsrLabelOrientation, GpsrLabelSize, GpsrMaterialId, GpsrWarningId } from '../types';
import { isProductNameLanguage } from './productNameSource';

export const GPSR_LABEL_MARGIN_MM = 2;
const MAX_PAGE_MM = 5000;

export const materialOptions: { id: GpsrMaterialId; label: string; en: string; ro: string; bg: string; hu: string }[] = [
  { id: 'plastic', label: '塑料', en: 'Plastic', ro: 'Plastic', bg: 'Пластмаса', hu: 'Műanyag' },
  { id: 'silicone', label: '硅胶', en: 'Silicone', ro: 'Silicon', bg: 'Силикон', hu: 'Szilikon' },
  { id: 'metal', label: '金属', en: 'Metal', ro: 'Metal', bg: 'Метал', hu: 'Fém' },
  { id: 'stainlessSteel', label: '不锈钢', en: 'Stainless steel', ro: 'Oțel inoxidabil', bg: 'Неръждаема стомана', hu: 'Rozsdamentes acél' },
  { id: 'textile', label: '织物', en: 'Textile', ro: 'Textil', bg: 'Текстил', hu: 'Textil' },
  { id: 'wood', label: '木质', en: 'Wood', ro: 'Lemn', bg: 'Дърво', hu: 'Fa' },
];

export const warningOptions: Record<GpsrWarningId, { label: string; ro: string; bg: string; hu: string }> = {
  none: { label: '无警示语', ro: '', bg: '', hu: '' },
  choking: {
    label: '防窒息警告',
    ro: 'Pericol de sufocare. Țineți departe de copii.',
    bg: 'Опасност от задушаване. Да се пази от деца.',
    hu: 'Fulladásveszély. Gyermekektől távol tartandó.',
  },
  fire: {
    label: '远离火源',
    ro: 'A se păstra departe de foc și căldură.',
    bg: 'Да се пази далеч от огън и топлина.',
    hu: 'Tűztől és hőtől távol tartandó.',
  },
};

const presetSizes: Record<Exclude<GpsrLabelSize, 'custom'>, readonly [number, number]> = {
  '70x80': [70, 80], '80x80': [80, 80], '100x100': [100, 100],
};

export function isValidEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const sum = [...value.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === Number(value[12]);
}

export function isValidManualUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch { return false; }
}

export function resolveGpsrPageSize(input: Pick<GpsrLabelDraft, 'labelSize' | 'customWidth' | 'customHeight' | 'orientation'>) {
  const [baseWidth, baseHeight] = input.labelSize === 'custom'
    ? [input.customWidth, input.customHeight]
    : presetSizes[input.labelSize as Exclude<GpsrLabelSize, 'custom'>] ?? [0, 0];
  if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight) || baseWidth < 70 || baseHeight < 80) {
    throw new Error('自定义标签尺寸不得小于 70 × 80 mm。');
  }
  if (baseWidth > MAX_PAGE_MM || baseHeight > MAX_PAGE_MM) throw new Error('标签尺寸超出 PDF 支持范围。');
  if (input.orientation !== 0 && input.orientation !== 90) throw new Error('出纸方向无效。');
  const [width, height] = input.orientation === 90 ? [baseHeight, baseWidth] : [baseWidth, baseHeight];
  return { width, height, margin: GPSR_LABEL_MARGIN_MM };
}

export function createDefaultGpsrLabelDraft(now = new Date()): GpsrLabelDraft {
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return {
    productName: { zh: '', ro: '', bg: '', hu: '' }, material: '', model: '', batch: `LOT-${date}`,
    ean13: '', manualUrl: '', labelSize: '70x80', customWidth: 70, customHeight: 80,
    orientation: 0 as GpsrLabelOrientation, icons: [], warningId: 'none',
  };
}

export function isGpsrLabelDraft(value: unknown): value is GpsrLabelDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Partial<GpsrLabelDraft>;
  const names = draft.productName as Partial<GpsrLabelDraft['productName']> | undefined;
  return typeof names?.zh === 'string' && typeof names.ro === 'string' && typeof names.bg === 'string' && typeof names.hu === 'string'
    && (draft.productNameSource === undefined || (typeof draft.productNameSource?.text === 'string'
      && (draft.productNameSource.language === '' || isProductNameLanguage(draft.productNameSource.language))))
    && (draft.productNameRevision === undefined || typeof draft.productNameRevision === 'string')
    && (draft.material === '' || materialOptions.some((item) => item.id === draft.material))
    && ['model', 'batch', 'ean13', 'manualUrl'].every((key) => typeof draft[key as keyof GpsrLabelDraft] === 'string')
    && (draft.labelSize === '70x80' || draft.labelSize === '80x80' || draft.labelSize === '100x100' || draft.labelSize === 'custom')
    && typeof draft.customWidth === 'number' && Number.isFinite(draft.customWidth)
    && typeof draft.customHeight === 'number' && Number.isFinite(draft.customHeight)
    && (draft.orientation === 0 || draft.orientation === 90)
    && Array.isArray(draft.icons) && draft.icons.every((icon) => ['ce', 'weee', 'age', 'triman'].includes(icon))
    && (draft.warningId === 'none' || draft.warningId === 'choking' || draft.warningId === 'fire');
}

export function hasCjkCharacters(value: string): boolean {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(value);
}
