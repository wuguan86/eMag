import { useId } from 'react';
import type { DeclarationDraft } from '../types';
import { Section, TextField } from './Fields';
import { declarationReferences } from '../config/declarationReferences';

export function DeclarationFields({ draft, onChange }: { draft: DeclarationDraft; onChange: (key: keyof DeclarationDraft, value: string) => void }) {
  const referenceId = useId();
  return <Section title="DoC 声明草稿" detail="A4 · 每页带草稿标识">
    <p className="notice">请填写与产品对应的法规及标准；工具不根据商品名称推断适用性，也不生成签名。</p>
    <div className="field"><label htmlFor={referenceId}>插入常见品类法规参考示例（需自行核对）</label><select id={referenceId} value="" onChange={(event) => {
      const reference = declarationReferences.find((item) => item.id === event.target.value);
      if (reference) { onChange('legislation', reference.legislation); onChange('standards', reference.standards); }
    }}><option value="">请选择品类，替换法规与标准字段</option>{declarationReferences.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
    <TextField label="产品描述" multiline value={draft.description} onChange={(value) => onChange('description', value)}/>
    <TextField label="适用法规" multiline placeholder="逐行填写法规名称和编号" value={draft.legislation} onChange={(value) => onChange('legislation', value)}/>
    <TextField label="协调标准" multiline placeholder="逐行填写标准编号及版本" value={draft.standards} onChange={(value) => onChange('standards', value)}/>
    <div className="form-grid"><TextField label="声明地点" value={draft.place} onChange={(value) => onChange('place', value)}/><TextField label="声明日期" type="date" value={draft.date} onChange={(value) => onChange('date', value)}/><TextField label="签署人姓名" value={draft.signatory} onChange={(value) => onChange('signatory', value)}/><TextField label="职务" value={draft.position} onChange={(value) => onChange('position', value)}/></div>
  </Section>;
}
