import { useId, useState } from 'react';
import type { Company } from '../types';
import { useCompanyTemplates, type CompanyRole } from '../storage/companyTemplates';
import { TextField } from './Fields';

export function CompanyTemplateControls({ role, company, compact = false }: { role: CompanyRole; company: Company; compact?: boolean }) {
  const templates = useCompanyTemplates(role);
  const { library, loading } = templates;
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const id = useId();
  const selected = library.templates.find((template) => template.id === library.selectedId);
  const perform = (operation: () => void) => {
    try { operation(); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : '模板操作失败，请重试。'); }
  };
  const management = <>
    <div className="template-actions">
      <button className="text-button" disabled={loading || !selected} onClick={() => perform(() => templates.select(selected!.id))}>应用所选模板</button>
      <button className="text-button" disabled={loading || !selected || selected.id === library.defaultId} onClick={() => perform(() => templates.setDefault(selected!.id))}>设为默认</button>
      <button className="text-button" disabled={loading || !selected} onClick={() => perform(() => templates.remove(selected!.id))}>删除模板</button>
    </div>
    <div className="template-save-row">
      <TextField label="新模板名称" value={name} onChange={setName} maxLength={80} placeholder="给当前企业资料命名"/>
      <button className="button subtle" disabled={loading} onClick={() => perform(() => { templates.save(name, company); setName(''); })}>保存为新模板</button>
    </div>
    <p className="helper">表单微调仅保存为当前草稿；保存新模板会创建独立副本。</p>
    {message && <p className="field-error" role="alert">{message}</p>}
  </>;
  return <div className={`company-template-controls${compact ? ' company-template-controls-compact' : ''}`}>
    <div className="field"><label htmlFor={id}>{role === 'euRep' ? 'EU REP 模板' : '制造商模板'}</label><select id={id} value={library.selectedId ?? ''} disabled={loading} onChange={(event) => perform(() => templates.select(event.target.value))}>
      <option value="" disabled>{loading ? '正在读取模板…' : '选择已保存模板'}</option>
      {library.templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.id === library.defaultId ? '（默认）' : ''}</option>)}
    </select></div>
    {compact ? <details className="template-manager">
      <summary>模板管理与保存</summary>
      {management}
    </details> : management}
  </div>;
}
