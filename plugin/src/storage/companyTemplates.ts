import { useSyncExternalStore } from 'react';
import type { Company } from '../types';
import { batchLocalUpdates, getLocalCell, registerAtomicLocalGroup } from './localStore';
import { isString } from './hooks';

export type CompanyRole = 'euRep' | 'manufacturer';
export interface CompanyTemplate { id: string; name: string; company: Company }
export interface CompanyTemplateLibrary { templates: CompanyTemplate[]; defaultId: string | null; selectedId: string | null }
const emptyLibrary: CompanyTemplateLibrary = { templates: [], defaultId: null, selectedId: null };
export const companyKeys = ['name', 'address', 'email', 'phone'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isCompany(value: unknown): value is Company {
  return isRecord(value) && companyKeys.every((key) => isString(value[key]));
}
export function isCompanyTemplateLibrary(value: unknown): value is CompanyTemplateLibrary {
  if (!isRecord(value) || !Array.isArray(value.templates)) return false;
  const templates = value.templates;
  if (!templates.every((template) => isRecord(template) && typeof template.id === 'string' && template.id.length > 0
    && typeof template.name === 'string' && template.name === template.name.trim() && template.name.length > 0
    && template.name.length <= 80 && isCompany(template.company))) return false;
  const ids = templates.map((template) => template.id);
  const names = templates.map((template) => template.name);
  return new Set(ids).size === ids.length && new Set(names).size === names.length
    && [value.defaultId, value.selectedId].every((id) => id === null || (typeof id === 'string' && ids.includes(id)));
}

export const getCompanyTemplateCell = (role: CompanyRole) => getLocalCell(`templates.${role}`, emptyLibrary, isCompanyTemplateLibrary);
export const getCompanyCells = (role: CompanyRole) => {
  registerAtomicLocalGroup(companyKeys.map((key) => `profile.${role}.${key}`));
  return Object.fromEntries(
    companyKeys.map((key) => [key, getLocalCell(`profile.${role}.${key}`, '', isString)]),
  ) as Record<keyof Company, ReturnType<typeof getLocalCell<string>>>;
};

export function applyCompany(role: CompanyRole, company: Company) {
  if (!isCompany(company)) return;
  const cells = getCompanyCells(role);
  // Chrome 只发送真正变化的键；共享修订号使相同电话/地址也参与整套模板同步。
  const groupRevision = crypto.randomUUID();
  batchLocalUpdates(() => companyKeys.forEach((key) => cells[key].set(company[key], groupRevision)));
}

export function useCompanyTemplates(role: CompanyRole) {
  const cell = getCompanyTemplateCell(role);
  const snapshot = useSyncExternalStore(cell.subscribe, cell.getSnapshot);
  const current = () => {
    if (cell.getSnapshot().loading) throw new Error('企业模板正在读取，请稍候。');
    if (cell.getSnapshot().readFailed) throw new Error('企业模板读取失败，请重新打开工具箱后重试。');
    return cell.getSnapshot().value;
  };
  return {
    library: snapshot.value,
    loading: snapshot.loading,
    save(name: string, company: Company) {
      const library = current();
      const trimmedName = name.trim();
      if (!trimmedName || trimmedName.length > 80) throw new Error('模板名称不能为空，且最多 80 个字符。');
      if (library.templates.some((template) => template.name === trimmedName)) throw new Error('该名称已存在，请使用其他模板名称。');
      if (!isCompany(company)) throw new Error('企业资料格式无效，无法保存模板。');
      const template: CompanyTemplate = { id: crypto.randomUUID(), name: trimmedName, company: { ...company } };
      cell.set({ templates: [...library.templates, template], defaultId: library.templates.length ? library.defaultId : template.id, selectedId: template.id });
    },
    select(id: string) {
      const library = current();
      const template = library.templates.find((item) => item.id === id);
      if (!template) return;
      batchLocalUpdates(() => { cell.set({ ...library, selectedId: id }); applyCompany(role, template.company); });
    },
    remove(id: string) {
      const library = current();
      cell.set({ templates: library.templates.filter((template) => template.id !== id), defaultId: library.defaultId === id ? null : library.defaultId, selectedId: library.selectedId === id ? null : library.selectedId });
    },
    setDefault(id: string) {
      const library = current();
      if (library.templates.some((template) => template.id === id)) cell.set({ ...library, defaultId: id });
    },
  };
}
