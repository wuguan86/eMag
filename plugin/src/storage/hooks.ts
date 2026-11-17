import { useSyncExternalStore } from 'react';
import { getLocalCell, getStorageStatus, subscribeStorageStatus } from './localStore';

export function useLocalValue<T>(key: string, initial: T, validate: (value: unknown) => value is T) {
  const cell = getLocalCell(key, initial, validate);
  const snapshot = useSyncExternalStore(cell.subscribe, cell.getSnapshot);
  return [snapshot.value, cell.set, snapshot.loading] as const;
}

export const useStorageStatus = () => useSyncExternalStore(subscribeStorageStatus, getStorageStatus);
export const isString = (value: unknown): value is string => typeof value === 'string' && value.length <= 20000;
export const isNonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const isNullableNonnegative = (value: unknown): value is number | null => value === null || isNonnegative(value);
