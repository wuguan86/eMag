import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ComplianceIcon, GpsrLabelDraft, LocalizedText, ProductNameSource } from '../types';
import { getLocalCell } from './localStore';
import { isString, useLocalValue } from './hooks';
import { createDefaultGpsrLabelDraft, isGpsrLabelDraft } from '../utils/gpsrLabel';
import { namesFromSource, normalizeProductNameSource } from '../utils/productNameSource';

const defaultDraft = createDefaultGpsrLabelDraft();
const draftCell = () => getLocalCell('gpsrLabel.draft', defaultDraft, isGpsrLabelDraft);

export function useGpsrLabelDraft() {
  const cell = draftCell();
  const snapshot = useSyncExternalStore(cell.subscribe, cell.getSnapshot);
  const draft = useMemo(() => normalizeProductNameSource(snapshot.value), [snapshot.value]);
  const [legacyName, , nameLoading] = useLocalValue('profile.productName', '', isString);
  const [legacyModel, , modelLoading] = useLocalValue('profile.model', '', isString);
  const [legacyBatch, , batchLoading] = useLocalValue('profile.batch', '', isString);
  const [legacySize, , sizeLoading] = useLocalValue('profile.labelSize', '70x40', (value): value is string => typeof value === 'string');
  const [legacyIcons, , iconsLoading] = useLocalValue<ComplianceIcon[]>('profile.icons', [], (value): value is ComplianceIcon[] =>
    Array.isArray(value) && value.every((icon) => ['ce', 'weee', 'age', 'triman', 'pap20'].includes(icon)));
  const legacyLoading = nameLoading || modelLoading || batchLoading || sizeLoading || iconsLoading;

  useEffect(() => {
    const current = cell.getSnapshot();
    if (snapshot.loading || legacyLoading || current.present || current.readFailed) return;
    const migrated: GpsrLabelDraft = {
      ...current.value,
      productName: { ...current.value.productName, zh: legacyName },
      model: legacyModel,
      batch: legacyBatch || current.value.batch,
      labelSize: legacySize === '100x100' ? '100x100' : '70x80',
      icons: legacyIcons.filter((icon): icon is Exclude<ComplianceIcon, 'pap20'> => icon !== 'pap20'),
    };
    cell.set(migrated);
  }, [cell, snapshot.loading, snapshot.present, snapshot.readFailed, snapshot.value, legacyLoading, legacyName, legacyModel, legacyBatch, legacySize, legacyIcons]);

  const currentDraft = () => normalizeProductNameSource(cell.getSnapshot().value);
  const setDraft = (draft: GpsrLabelDraft) => cell.set({ ...normalizeProductNameSource(draft), productNameRevision: crypto.randomUUID() });
  const setField = <Key extends keyof GpsrLabelDraft>(key: Key, value: GpsrLabelDraft[Key]) => {
    cell.set({ ...currentDraft(), [key]: value });
  };
  const setProductNameSource = (source: ProductNameSource) => {
    // 原文与语言决定整组译文的有效性，同一次写入清除旧译文并复用已知语言的原文。
    cell.set({ ...currentDraft(), productNameSource: source, productName: namesFromSource(source), productNameRevision: crypto.randomUUID() });
  };
  const setProductName = (language: keyof LocalizedText, value: string) => {
    const current = currentDraft();
    if (language === 'zh' && current.productNameSource.language === 'zh-CN') {
      setProductNameSource({ text: value, language: 'zh-CN' });
    } else cell.set({ ...current, productName: { ...current.productName, [language]: value }, productNameRevision: crypto.randomUUID() });
  };
  const applyTranslations = (expected: GpsrLabelDraft, translations: LocalizedText): boolean => {
    const current = currentDraft();
    // 品名编辑更新修订号，存储回声及无关字段修改保留修订号；兼容旧记录时再核对实际文本。
    if (current.productNameRevision !== expected.productNameRevision
      || (Object.keys(current.productName) as (keyof LocalizedText)[]).some((language) => current.productName[language] !== expected.productName[language])
      || current.productNameSource.text !== expected.productNameSource?.text
      || current.productNameSource.language !== expected.productNameSource?.language) return false;
    cell.set({ ...current, productName: translations, productNameRevision: crypto.randomUUID() });
    return true;
  };
  return { draft, loading: snapshot.loading || legacyLoading, setDraft, setField, setProductName, setProductNameSource, applyTranslations };
}
