import { useCallback, useMemo, useRef, useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import type { Company, GpsrLabelDraft, LocalizedText, ProductNameSource, ProductSnapshot } from '../types';
import { useComplianceProfile } from '../storage/profile';
import { useGpsrLabelDraft } from '../storage/gpsrLabelDraft';
import { flushStorage } from '../storage/localStore';
import { createDefaultGpsrLabelDraft } from '../utils/gpsrLabel';
import { translateProductName } from '../utils/gpsrTranslation';
import { readCurrentProductName } from '../utils/productImport';
import { exportGpsrLabel } from '../utils/pdf/gpsrLabel';
import { CompanyFields } from './CompanyFields';
import { FeedbackDialog } from './FeedbackDialog';
import { GpsrLabelPreview } from './GpsrLabelPreview';
import { GpsrLabelSettings } from './GpsrLabelSettings';
import { GpsrProductFields } from './GpsrProductFields';
import { GpsrTraceabilityFields } from './GpsrTraceabilityFields';

export function GPSRLabelTab({ product }: { product: ProductSnapshot | null }) {
  const container = useRef<HTMLDivElement>(null);
  const label = useGpsrLabelDraft();
  const companyFields = useComplianceProfile();
  const [message, setMessage] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [translating, setTranslating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewValid, setPreviewValid] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const onPreviewValidity = useCallback((valid: boolean) => setPreviewValid(valid), []);
  const data = useMemo(() => ({ draft: label.draft, euRep: companyFields.profile.euRep, manufacturer: companyFields.profile.manufacturer }), [label.draft, companyFields.profile.euRep, companyFields.profile.manufacturer]);

  const setField = <Key extends keyof GpsrLabelDraft>(key: Key, value: GpsrLabelDraft[Key]) => label.setField(key, value);
  const setProductName = (language: keyof LocalizedText, value: string) => label.setProductName(language, value);
  const setSource = (source: ProductNameSource) => {
    label.setProductNameSource(source);
    setMessage('原文或语言已更新，旧译文已清除，请重新翻译并核对。');
  };
  const updateCompany = (role: 'euRep' | 'manufacturer', key: keyof Company, value: string) => {
    (role === 'euRep' ? companyFields.setEuRep : companyFields.setManufacturer)(key, value);
  };

  const importProduct = async () => {
    try {
      const source = await readCurrentProductName(product);
      label.setProductNameSource(source);
      setMessage('已导入商品标题并清除旧译文，请确认原文语言后翻译。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '商品标题读取失败，请重试。');
    }
  };

  const translate = async () => {
    if (translating) return;
    setTranslating(true);
    setMessage('正在请求翻译…');
    const expected = label.draft;
    try {
      const translations = await translateProductName(expected.productNameSource.text, expected.productNameSource.language);
      const applied = label.applyTranslations(expected, translations);
      setMessage(applied ? '中文对照和三语品名已填入，请核对后再导出。' : '品名已编辑，已忽略过期翻译，请按当前原文重新翻译。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '翻译失败，请稍后重试。');
    } finally { setTranslating(false); }
  };

  const resetProduct = () => {
    const defaults = createDefaultGpsrLabelDraft();
    label.setDraft({
      ...label.draft,
      productNameSource: { text: '', language: 'zh-CN' },
      productName: { zh: '', ro: '', bg: '', hu: '' }, material: '', model: '', batch: defaults.batch,
      ean13: '', manualUrl: '',
    });
    setMessage('产品信息已清空，尺寸、企业资料和适用标志已保留。');
  };

  const exportPdf = async () => {
    if (exporting || !previewValid) return;
    setExporting(true);
    setExportMessage('正在准备本地 PDF…');
    try {
      await flushStorage();
      await exportGpsrLabel(data);
      setExportMessage('PDF 已生成并发起下载。');
    } catch (error) {
      console.warn('GPSR 标签 PDF 导出失败，当前表单已保留。', error);
      setExportMessage(error instanceof Error ? error.message : 'PDF 导出失败，请检查表单后重试。');
    } finally { setExporting(false); }
  };

  return <div className="gpsr-label-tab" ref={container}>
    <div className="gpsr-label-content">
    {label.loading && <p className="section helper" role="status">正在读取本地标签资料…</p>}
    <nav className="gpsr-section-nav" aria-label="GPSR 标签分区">
      {[
        ['gpsr-product', '产品信息'], ['gpsr-eu-rep', 'EU REP'], ['gpsr-manufacturer', '制造商'],
        ['gpsr-traceability', '追溯码'], ['gpsr-settings', '标签设置'], ['gpsr-preview', '预览'],
      ].map(([id, title]) => <button key={id} type="button" onClick={() => {
        // 只定位当前工具容器，兼容商品页 Shadow DOM 并避免改动宿主页面地址。
        container.current?.querySelector(`#${id}`)?.scrollIntoView({ block: 'start', behavior: 'auto' });
      }}>{title}</button>)}
    </nav>
    <GpsrProductFields sectionId="gpsr-product" draft={label.draft} onField={setField} onName={setProductName} onSource={setSource} onImport={() => { void importProduct(); }}
      onReset={resetProduct} onTranslate={() => { void translate(); }} translating={translating} message={message}/>
    <CompanyFields sectionId="gpsr-eu-rep" company={companyFields.profile.euRep} onChange={(key, value) => updateCompany('euRep', key, value)} gpsr
      headingAction={<button className="gpsr-service-link" type="button" onClick={() => setServiceOpen(true)}>没有欧代？点击特惠办理</button>}/>
    <CompanyFields sectionId="gpsr-manufacturer" manufacturer company={companyFields.profile.manufacturer} onChange={(key, value) => updateCompany('manufacturer', key, value)} gpsr/>
    <GpsrTraceabilityFields sectionId="gpsr-traceability" draft={label.draft} onField={setField}/>
    <GpsrLabelSettings sectionId="gpsr-settings" draft={label.draft} onField={setField}/>
    <GpsrLabelPreview sectionId="gpsr-preview" data={data} onValidity={onPreviewValidity}/>
    </div>
    <div className="gpsr-export-bar">
      <button className="button primary full" type="button" disabled={exporting || !previewValid} onClick={() => { void exportPdf(); }}>
        {exporting ? <LoaderCircle size={16} className="spin"/> : <Download size={16}/>}
        {exporting ? '正在生成…' : '一键下载热敏打印 PDF'}
      </button>
      {exportMessage && <p className="export-message" role="status">{exportMessage}</p>}
    </div>
    {serviceOpen && <FeedbackDialog onClose={() => setServiceOpen(false)} title="欧盟责任人办理咨询" intro="扫码或添加微信，咨询适合你商品的 GPSR 欧盟责任人办理服务。"/>}
  </div>;
}
