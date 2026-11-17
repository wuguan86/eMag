import { useState } from 'react';
import { FileText, LoaderCircle } from 'lucide-react';
import { useComplianceProfile, useDeclaration } from '../storage/profile';
import { flushStorage } from '../storage/localStore';
import { Section, TextField } from './Fields';
import { CompanyFields } from './CompanyFields';
import { DeclarationFields } from './DeclarationFields';
export function ComplianceWorkspace() {
  const fields = useComplianceProfile();
  const { profile } = fields;
  const { draft, setField } = useDeclaration();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const exportFile = async () => {
    if (busy) return;
    setBusy(true); setMessage('正在准备本地 PDF…');
    try {
      await flushStorage();
      const { exportDeclaration } = await import('../utils/pdf/export');
      await exportDeclaration(profile, draft);
      setMessage('PDF 已生成并发起下载。打印时请选择实际大小 / 100%。');
    } catch (error) {
      console.warn('打印 PDF 生成失败，表单数据仍保留。', error);
      setMessage(error instanceof Error ? error.message : '导出失败，请检查表单并重试。');
    } finally { setBusy(false); }
  };
  return <>
    <Section title="产品信息" detail="EU DoC 草稿">
      <TextField label="产品名称" value={profile.productName} onChange={fields.setProductName}/>
      <div className="form-grid"><TextField label="型号 · Model" value={profile.model} onChange={fields.setModel}/><TextField label="批次号 · Batch No." value={profile.batch} onChange={fields.setBatch}/></div>
    </Section>
    <CompanyFields company={profile.euRep} onChange={fields.setEuRep}/>
    <CompanyFields manufacturer company={profile.manufacturer} onChange={fields.setManufacturer}/>
    <DeclarationFields draft={draft} onChange={setField}/>
    <div className="export-area">
      <button className="button primary full" disabled={busy} onClick={() => { void exportFile(); }}>{busy ? <LoaderCircle size={16} className="spin"/> : <FileText size={16}/>} {busy ? '正在生成…' : '导出 A4 DoC 草稿'}</button>
      {message && <p className="export-message" role="status">{message}</p>}
    </div>
  </>;
}
