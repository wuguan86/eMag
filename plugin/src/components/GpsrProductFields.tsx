import { useId } from 'react';
import { RotateCcw } from 'lucide-react';
import type { GpsrLabelDraft, ProductNameSource } from '../types';
import { materialOptions } from '../utils/gpsrLabel';
import { labelNameLimit, productTitleLimit } from '../utils/gpsrNameProtocol';
import { normalizeProductNameSource, productNameLanguages } from '../utils/productNameSource';
import { Section, TextField } from './Fields';
import { GpsrNameServiceSettings } from './GpsrNameServiceSettings';
import type { useGpsrProductNames } from './useGpsrProductNames';

export function GpsrProductFields({ draft, onField, names, sectionId }: {
  draft: GpsrLabelDraft;
  onField: <Key extends keyof GpsrLabelDraft>(key: Key, value: GpsrLabelDraft[Key]) => void;
  names: ReturnType<typeof useGpsrProductNames>;
  sectionId?: string;
}) {
  const materialId = useId();
  const languageId = useId();
  const source = normalizeProductNameSource(draft).productNameSource;
  const shortName = draft.productNameRefined ?? '';
  const busy = names.pending !== null;
  return <Section id={sectionId} title="产品基础信息">
    <div className="gpsr-product-actions">
      <button className="button subtle" type="button" disabled={names.pending === 'import'} onClick={() => { void names.importProduct(); }}>从当前商品导入</button>
      <button className="button gpsr-reset" type="button" onClick={names.resetProduct}><RotateCcw size={14} aria-hidden="true"/>清空重填</button>
    </div>
    <TextField label="商品原始品名" value={source.text} onChange={(text) => names.setSource({ ...source, text })} maxLength={productTitleLimit} multiline/>
    <div className="field"><label htmlFor={languageId}>原文语言</label><select id={languageId} value={source.language}
      onChange={(event) => names.setSource({ ...source, language: event.target.value as ProductNameSource['language'] })}>
      <option value="">请选择原文语言</option>{productNameLanguages.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
    </select></div>
    <TextField label="短品名" value={shortName} onChange={names.setShortName} maxLength={labelNameLimit} placeholder="可编辑，留空时翻译原标题"/>
    <div className="gpsr-product-actions gpsr-name-actions">
      <button className="button subtle" type="button" disabled={busy || !source.text.trim()} onClick={() => { void names.refine(); }}>
        {names.pending === 'refine' ? '正在提炼…' : '提炼品名'}
      </button>
      <button className="button subtle gpsr-translate" type="button" disabled={busy || !(shortName.trim() || source.text.trim()) || !source.language} onClick={() => { void names.translate(); }}>
        {names.pending === 'translate' ? '正在翻译…' : '翻译并生成三语品名'}
      </button>
    </div>
    <p className="helper">导入、提炼或翻译时，相关品名和语言会发送至品名服务。请核对短品名和译文后再导出。</p>
    {names.message && <p className="export-message" role="status">{names.message}</p>}
    <GpsrNameServiceSettings/>
    <TextField label="中文品名" value={draft.productName.zh} onChange={(value) => names.setName('zh', value)} maxLength={labelNameLimit}/>
    {(['ro', 'bg', 'hu'] as const).map((language) => {
      const labels = { ro: '罗马尼亚语 · RO', bg: '保加利亚语 · BG', hu: '匈牙利语 · HU' };
      return <div className="gpsr-language-field" key={language}>
        <TextField label={labels[language]} value={draft.productName[language]} onChange={(value) => names.setName(language, value)} maxLength={labelNameLimit}/>
        <small>中文对照：{draft.productName.zh || '尚未生成，请翻译或填写中文品名'}</small>
      </div>;
    })}
    <div className="field"><label htmlFor={materialId}>产品材质</label><select id={materialId} value={draft.material} onChange={(event) => onField('material', event.target.value as GpsrLabelDraft['material'])}>
      <option value="">请选择材质</option>
      {materialOptions.map(({ id, label, ro, bg, hu }) => (
        <option key={id} value={id}>{label} · {ro} / {bg} / {hu}</option>
      ))}
    </select></div>
    <TextField label="产品编号" value={draft.model} onChange={(value) => onField('model', value)} maxLength={80}/>
    <TextField label="产品尺寸" value={draft.productSize ?? ''} onChange={(value) => onField('productSize', value)} optional maxLength={80}/>
  </Section>;
}
