import { useId } from 'react';
import { RotateCcw } from 'lucide-react';
import type { GpsrLabelDraft, LocalizedText, ProductNameSource } from '../types';
import { materialOptions } from '../utils/gpsrLabel';
import { normalizeProductNameSource, productNameLanguages } from '../utils/productNameSource';
import { Section, TextField } from './Fields';

export function GpsrProductFields({ draft, onField, onName, onSource, onImport, onReset, onTranslate, translating, message, sectionId }: {
  draft: GpsrLabelDraft;
  onField: <Key extends keyof GpsrLabelDraft>(key: Key, value: GpsrLabelDraft[Key]) => void;
  onName: (language: keyof LocalizedText, value: string) => void;
  onSource: (source: ProductNameSource) => void;
  onImport: () => void;
  onReset: () => void;
  onTranslate: () => void;
  translating: boolean;
  message: string;
  sectionId?: string;
}) {
  const materialId = useId();
  const languageId = useId();
  const source = normalizeProductNameSource(draft).productNameSource;
  return <Section id={sectionId} title="产品基础信息">
    <div className="gpsr-product-actions">
      <button className="button subtle" type="button" onClick={onImport}>从当前商品导入</button>
      <button className="button gpsr-reset" type="button" onClick={onReset}><RotateCcw size={14} aria-hidden="true"/>清空重填</button>
    </div>
    <TextField label="商品原始品名" value={source.text} onChange={(text) => onSource({ ...source, text })} maxLength={160}/>
    <div className="field"><label htmlFor={languageId}>原文语言</label><select id={languageId} value={source.language}
      onChange={(event) => onSource({ ...source, language: event.target.value as ProductNameSource['language'] })}>
      <option value="">请选择原文语言</option>{productNameLanguages.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
    </select></div>
    <button className="button subtle gpsr-translate" type="button" disabled={translating || !source.text.trim() || !source.language} onClick={onTranslate}>
      {translating ? '正在翻译…' : '翻译并生成三语品名'}
    </button>
    <p className="helper">请确认原文语言。点击翻译会向 MyMemory 免费翻译服务发送原始品名，生成中文对照及三语品名；结果请自行核对。</p>
    <TextField label="中文品名" value={draft.productName.zh} onChange={(value) => onName('zh', value)} maxLength={160}/>
    {(['ro', 'bg', 'hu'] as const).map((language) => {
      const labels = { ro: '罗马尼亚语 · RO', bg: '保加利亚语 · BG', hu: '匈牙利语 · HU' };
      return <div className="gpsr-language-field" key={language}>
        <TextField label={labels[language]} value={draft.productName[language]} onChange={(value) => onName(language, value)} maxLength={160}/>
        <small>中文对照：{draft.productName.zh || '尚未生成，请翻译或填写中文品名'}</small>
      </div>;
    })}
    <div className="field"><label htmlFor={materialId}>产品材质</label><select id={materialId} value={draft.material} onChange={(event) => onField('material', event.target.value as GpsrLabelDraft['material'])}>
      <option value="">请选择材质</option>{materialOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></div>
    <TextField label="产品编号" value={draft.model} onChange={(value) => onField('model', value)} maxLength={80}/>
    <TextField label="产品尺寸" value={draft.productSize ?? ''} onChange={(value) => onField('productSize', value)} optional maxLength={80}/>
    {message && <p className="export-message" role="status">{message}</p>}
  </Section>;
}
