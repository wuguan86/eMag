import { useId, useState, type ReactNode } from 'react';
import type { Company } from '../types';
import { TextField, Section } from './Fields';
import { CompanyTemplateControls } from './CompanyTemplateControls';
import { hasCjkCharacters } from '../utils/gpsrLabel';

export function CompanyFields({ company, onChange, manufacturer = false, gpsr = false, headingAction, sectionId }: {
  company: Company; onChange: (key: keyof Company, value: string) => void; manufacturer?: boolean; gpsr?: boolean; headingAction?: ReactNode; sectionId?: string;
}) {
  const containsCjk = ['name', 'address', 'email', ...(!gpsr && !manufacturer ? ['phone'] : [])].some((key) => hasCjkCharacters(company[key as keyof Company]));
  const [editing, setEditing] = useState(false);
  const detailsId = useId();
  const summary = [company.name || '公司名待填', company.address || '地址待填', company.email || '邮箱待填', ...(!gpsr && !manufacturer && company.phone ? [company.phone] : [])].join(' · ');
  const complete = Boolean(company.name.trim() && company.address.trim() && company.email.trim());
  const title = manufacturer ? '制造商 · Manufacturer' : '欧盟责任人 · EU REP';
  return <Section id={sectionId} title={title} action={headingAction}>
    <CompanyTemplateControls role={manufacturer ? 'manufacturer' : 'euRep'} company={company} compact={gpsr}/>
    {gpsr && <>
      <div className="company-summary">
        <p className="company-summary-values" title={summary}>{summary}</p>
        <span className={`company-summary-status${complete && !containsCjk ? ' is-complete' : ''}`}>
          {containsCjk ? '需使用英文或拼音' : complete ? '资料完整' : '资料未填写完整'}
        </span>
        <button className="text-button" type="button" aria-expanded={editing} aria-controls={detailsId} onClick={() => setEditing((value) => !value)}>
          {editing ? '收起编辑' : complete ? '编辑详情' : '填写资料'}
        </button>
      </div>
    </>}
    <div id={detailsId} hidden={gpsr && !editing}>
      {gpsr && <p className="helper">{manufacturer ? '请使用营业执照英文名或拼音，以及中国实体地址英文。' : '请填写该商品实际的欧盟责任人资料，字段使用英文。'}</p>}
      <TextField label={gpsr ? 'Company Name' : '公司名称'} value={company.name} onChange={(value) => onChange('name', value)}/>
      <TextField label={gpsr ? manufacturer ? 'Production Address' : 'EU Postal Address' : manufacturer ? '国内实体地址' : '欧盟实体地址'} multiline value={company.address} onChange={(value) => onChange('address', value)}/>
      <div className={manufacturer ? '' : 'form-grid'}>
        <TextField label={gpsr ? 'Email' : '联系邮箱'} type="email" value={company.email} onChange={(value) => onChange('email', value)}/>
        {!manufacturer && !gpsr && <TextField label="联系电话" optional type="tel" value={company.phone} onChange={(value) => onChange('phone', value)}/>}
      </div>
      {gpsr && containsCjk && <p className="field-error" role="alert">公司名称、地址和邮箱必须使用英文或拼音。</p>}
    </div>
  </Section>;
}
