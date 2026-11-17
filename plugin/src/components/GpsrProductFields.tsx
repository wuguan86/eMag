import { useId } from 'react';
import { RotateCcw } from 'lucide-react';
import type { GpsrLabelDraft, LocalizedText } from '../types';
import { materialOptions } from '../utils/gpsrLabel';
import { Section, TextField } from './Fields';

export function GpsrProductFields({ draft, onField, onName, onImport, onReset, onTranslate, translating, message, sectionId }: {
  draft: GpsrLabelDraft;
  onField: <Key extends keyof GpsrLabelDraft>(key: Key, value: GpsrLabelDraft[Key]) => void;
  onName: (language: keyof LocalizedText, value: string) => void;
  onImport: () => void;
  onReset: () => void;
  onTranslate: () => void;
  translating: boolean;
  message: string;
  sectionId?: string;
}) {
  const materialId = useId();
  return <Section id={sectionId} title="产品基础信息">
    <div className="gpsr-product-actions">
      <button className="button subtle" type="button" onClick={onImport}>从当前商品导入</button>
      <button className="button gpsr-reset" type="button" onClick={onReset}><RotateCcw size={14} aria-hidden="true"/>清空重填</button>
    </div>
    <TextField label="商品原始品名 / 中文品名" value={draft.productName.zh} onChange={(value) => onName('zh', value)} maxLength={160}/>
    <button className="button subtle gpsr-translate" type="button" disabled={translating || !draft.productName.zh.trim()} onClick={onTranslate}>
      {translating ? '正在翻译…' : 'AI / 翻译转三语'}
    </button>
    <p className="helper">点击翻译时只会向免费翻译服务发送中文品名，翻译结果请自行核对。</p>
    {(['ro', 'bg', 'hu'] as const).map((language) => {
      const labels = { ro: '罗马尼亚语 · RO', bg: '保加利亚语 · BG', hu: '匈牙利语 · HU' };
      return <div className="gpsr-language-field" key={language}>
        <TextField label={labels[language]} value={draft.productName[language]} onChange={(value) => onName(language, value)} maxLength={160}/>
        <small>中文对照：{draft.productName.zh || '尚未填写'}</small>
      </div>;
    })}
    <div className="field"><label htmlFor={materialId}>产品材质</label><select id={materialId} value={draft.material} onChange={(event) => onField('material', event.target.value as GpsrLabelDraft['material'])}>
      <option value="">请选择材质</option>{materialOptions.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.en} / {item.ro} / {item.bg} / {item.hu}</option>)}
    </select></div>
    <div className="gpsr-two-column">
      <TextField label="型号 · Model No." value={draft.model} onChange={(value) => onField('model', value)} maxLength={80}/>
      <TextField label="生产批次 · Batch No." value={draft.batch} onChange={(value) => onField('batch', value)} maxLength={80}/>
    </div>
    {message && <p className="export-message" role="status">{message}</p>}
  </Section>;
}
