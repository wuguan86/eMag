import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ComplianceIcon, GpsrLabelDraft, LocalizedText, ProductNameSource } from '../types';
import { getLocalCell } from './localStore';
import { isString, useLocalValue } from './hooks';
import { createDefaultGpsrLabelDraft, isGpsrLabelDraft } from '../utils/gpsrLabel';
import { namesFromSource, normalizeProductNameSource } from '../utils/productNameSource';
import { readLabelName, translationKeys } from '../utils/gpsrNameProtocol';

const defaultDraft = createDefaultGpsrLabelDraft();
const draftCell = () => getLocalCell('gpsrLabel.draft', defaultDraft, isGpsrLabelDraft);

function updateNameSource(draft: GpsrLabelDraft, source: ProductNameSource, refined: string) {
  const effectiveName = readLabelName(refined.trim() || source.text) ?? '';
  return { ...draft, productNameSource: source, productNameRefined: refined,
    productName: namesFromSource({ ...source, text: effectiveName }), productNameRevision: crypto.randomUUID() };
}

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
  const setProductNameSource = (source: ProductNameSource, refined = '') => {
    // 原文、语言、短品名和对应译文一次写入，避免窗口读到混用的品名。
    const next = updateNameSource(currentDraft(), source, refined);
    cell.set(next);
    return next;
  };
  const setRefinedName = (refined: string) => {
    const current = currentDraft();
    cell.set(updateNameSource(current, current.productNameSource, refined));
  };
  const setProductName = (language: keyof LocalizedText, value: string) => {
    const current = currentDraft();
    cell.set({ ...current, productName: { ...current.productName, [language]: value }, productNameRevision: crypto.randomUUID() });
  };
  const isCurrentName = (expected: GpsrLabelDraft) => {
    const current = currentDraft();
    // 品名编辑更新修订号，存储回声及无关字段修改保留修订号；兼容旧记录时再核对实际文本。
    return current.productNameRevision === expected.productNameRevision
      && translationKeys.every((language) => current.productName[language] === expected.productName[language])
      && (current.productNameRefined ?? '') === (expected.productNameRefined ?? '')
      && current.productNameSource.text === expected.productNameSource?.text
      && current.productNameSource.language === expected.productNameSource?.language;
  };
  const applyTranslations = (expected: GpsrLabelDraft, translations: LocalizedText): boolean => {
    if (!isCurrentName(expected)) return false;
    cell.set({ ...currentDraft(), productName: translations, productNameRevision: crypto.randomUUID() });
    return true;
  };
  return { draft, loading: snapshot.loading || legacyLoading, currentDraft, isCurrentName,
    setDraft, setField, setProductName, setProductNameSource, setRefinedName, applyTranslations };
}
