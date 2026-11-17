import { useEffect, useSyncExternalStore } from 'react';
import type { ComplianceIcon, GpsrLabelDraft, LocalizedText } from '../types';
import { getLocalCell } from './localStore';
import { isString, useLocalValue } from './hooks';
import { createDefaultGpsrLabelDraft, isGpsrLabelDraft } from '../utils/gpsrLabel';

const defaultDraft = createDefaultGpsrLabelDraft();
const draftCell = () => getLocalCell('gpsrLabel.draft', defaultDraft, isGpsrLabelDraft);

export function useGpsrLabelDraft() {
  const cell = draftCell();
  const snapshot = useSyncExternalStore(cell.subscribe, cell.getSnapshot);
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

  const setDraft = (draft: GpsrLabelDraft) => cell.set(draft);
  const setField = <Key extends keyof GpsrLabelDraft>(key: Key, value: GpsrLabelDraft[Key]) => {
    cell.set({ ...cell.getSnapshot().value, [key]: value });
  };
  const setProductName = (language: keyof LocalizedText, value: string) => {
    cell.set({ ...cell.getSnapshot().value, productName: { ...cell.getSnapshot().value.productName, [language]: value } });
  };
  return { draft: snapshot.value, loading: snapshot.loading || legacyLoading, setDraft, setField, setProductName };
}
