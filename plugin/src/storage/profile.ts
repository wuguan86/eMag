import { useEffect, useSyncExternalStore } from 'react';
import type { Company, ComplianceIcon, ComplianceProfile, DeclarationDraft, LabelSize } from '../types';
import { isString, useLocalValue } from './hooks';
import { applyCompany, getCompanyCells, getCompanyTemplateCell, type CompanyRole } from './companyTemplates';
import { batchLocalUpdates } from './localStore';

function useCompany(role: CompanyRole): [Company, (key: keyof Company, value: string) => void] {
  const cells = getCompanyCells(role);
  const name = useSyncExternalStore(cells.name.subscribe, cells.name.getSnapshot);
  const address = useSyncExternalStore(cells.address.subscribe, cells.address.getSnapshot);
  const email = useSyncExternalStore(cells.email.subscribe, cells.email.getSnapshot);
  const phone = useSyncExternalStore(cells.phone.subscribe, cells.phone.getSnapshot);
  const templateCell = getCompanyTemplateCell(role);
  const templates = useSyncExternalStore(templateCell.subscribe, templateCell.getSnapshot);
  useEffect(() => {
    // 四个旧字段全部读取完成且从未保存过，才允许默认模板初始化。
    // 再次检查实时快照，避免 effect 排队期间的新输入或跨窗口同步被覆盖。
    const current = Object.values(getCompanyCells(role)).map((cell) => cell.getSnapshot());
    if (templateCell.getSnapshot().loading || current.some((field) => field.loading || field.present || field.readFailed)) return;
    const library = templateCell.getSnapshot().value;
    const template = library.templates.find((item) => item.id === library.defaultId);
    if (template) batchLocalUpdates(() => {
      templateCell.set({ ...library, selectedId: template.id });
      applyCompany(role, template.company);
    });
  }, [role, templateCell, templates, name, address, email, phone]);
  return [{ name: name.value, address: address.value, email: email.value, phone: phone.value }, (key, value) => cells[key].set(value)];
}

const validSize = (value: unknown): value is LabelSize => ['50x30', '70x40', '100x100'].includes(String(value));
const validIcons = (value: unknown): value is ComplianceIcon[] => Array.isArray(value)
  && value.length <= 5 && new Set(value).size === value.length
  && value.every((item) => ['ce', 'weee', 'age', 'triman', 'pap20'].includes(item));

export function useComplianceProfile() {
  const [productName, setProductName] = useLocalValue('profile.productName', '', isString);
  const [model, setModel] = useLocalValue('profile.model', '', isString);
  const [batch, setBatch] = useLocalValue('profile.batch', '', isString);
  const [warningId, setWarningId] = useLocalValue('profile.warningId', 'none', isString);
  const [customWarning, setCustomWarning] = useLocalValue('profile.customWarning', '', isString);
  const [labelSize, setLabelSize] = useLocalValue<LabelSize>('profile.labelSize', '70x40', validSize);
  const [icons, setIcons] = useLocalValue<ComplianceIcon[]>('profile.icons', [], validIcons);
  const [euRep, setEuRep] = useCompany('euRep');
  const [manufacturer, setManufacturer] = useCompany('manufacturer');
  const profile: ComplianceProfile = { productName, model, batch, warningId, customWarning, labelSize, icons, euRep, manufacturer };
  return { profile, setProductName, setModel, setBatch, setWarningId, setCustomWarning, setLabelSize, setIcons, setEuRep, setManufacturer };
}

export function useDeclaration() {
  const [description, setDescription] = useLocalValue('doc.description', '', isString);
  const [legislation, setLegislation] = useLocalValue('doc.legislation', '', isString);
  const [standards, setStandards] = useLocalValue('doc.standards', '', isString);
  const [place, setPlace] = useLocalValue('doc.place', '', isString);
  const [date, setDate] = useLocalValue('doc.date', '', isString);
  const [signatory, setSignatory] = useLocalValue('doc.signatory', '', isString);
  const [position, setPosition] = useLocalValue('doc.position', '', isString);
  const draft: DeclarationDraft = { description, legislation, standards, place, date, signatory, position };
  const setters = { description: setDescription, legislation: setLegislation, standards: setStandards, place: setPlace, date: setDate, signatory: setSignatory, position: setPosition };
  return { draft, setField: (key: keyof DeclarationDraft, value: string) => setters[key](value) };
}
