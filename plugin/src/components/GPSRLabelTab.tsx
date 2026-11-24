import { useCallback, useMemo, useRef, useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import type { Company, ProductSnapshot } from '../types';
import { useComplianceProfile } from '../storage/profile';
import { useGpsrLabelDraft } from '../storage/gpsrLabelDraft';
import { flushStorage } from '../storage/localStore';
import { exportGpsrLabel } from '../utils/pdf/gpsrLabel';
import { exportGpsrLabelImage } from '../utils/gpsrLabelImage';
import { CompanyFields } from './CompanyFields';
import { FeedbackDialog } from './FeedbackDialog';
import { GpsrLabelPreview } from './GpsrLabelPreview';
import { GpsrLabelSettings } from './GpsrLabelSettings';
import { GpsrProductFields } from './GpsrProductFields';
import { GpsrTraceabilityFields } from './GpsrTraceabilityFields';
import { useGpsrProductNames } from './useGpsrProductNames';

export function GPSRLabelTab({ product }: { product: ProductSnapshot | null }) {
  const container = useRef<HTMLDivElement>(null);
  const label = useGpsrLabelDraft();
  const names = useGpsrProductNames(label, product);
  const companyFields = useComplianceProfile();
  const [exportMessage, setExportMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const [previewValid, setPreviewValid] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const onPreviewValidity = useCallback((valid: boolean) => setPreviewValid(valid), []);
  const data = useMemo(() => ({ draft: label.draft, euRep: companyFields.profile.euRep, manufacturer: companyFields.profile.manufacturer }), [label.draft, companyFields.profile.euRep, companyFields.profile.manufacturer]);

  const updateCompany = (role: 'euRep' | 'manufacturer', key: keyof Company, value: string) => {
    (role === 'euRep' ? companyFields.setEuRep : companyFields.setManufacturer)(key, value);
  };

  const exportFile = async (format: 'pdf' | 'png') => {
    if (exporting || !previewValid) return;
    setExporting(true);
    const formatName = format === 'pdf' ? 'PDF' : 'PNG 图片';
    setExportMessage(`正在准备本地 ${formatName}…`);
    try {
      await flushStorage();
      if (format === 'pdf') await exportGpsrLabel(data);
      else await exportGpsrLabelImage(data);
      setExportMessage(`${formatName} 已生成并发起下载。`);
    } catch (error) {
      console.warn(`GPSR 标签 ${formatName} 导出失败，当前表单已保留。`, error);
      setExportMessage(error instanceof Error ? error.message : `${formatName} 导出失败，请检查表单后重试。`);
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
    <GpsrProductFields sectionId="gpsr-product" draft={label.draft} onField={label.setField} names={names}/>
    <CompanyFields sectionId="gpsr-eu-rep" company={companyFields.profile.euRep} onChange={(key, value) => updateCompany('euRep', key, value)} gpsr
      headingAction={<button className="gpsr-service-link" type="button" onClick={() => setServiceOpen(true)}>没有欧代？点击特惠办理</button>}/>
    <CompanyFields sectionId="gpsr-manufacturer" manufacturer company={companyFields.profile.manufacturer} onChange={(key, value) => updateCompany('manufacturer', key, value)} gpsr/>
    <GpsrTraceabilityFields sectionId="gpsr-traceability" draft={label.draft} onField={label.setField}/>
    <GpsrLabelSettings sectionId="gpsr-settings" draft={label.draft} onField={label.setField}/>
    <GpsrLabelPreview sectionId="gpsr-preview" data={data} onValidity={onPreviewValidity}/>
    </div>
    <div className="gpsr-export-bar">
      <button className="button primary full" type="button" disabled={exporting || !previewValid} onClick={() => { void exportFile('pdf'); }}>
        {exporting ? <LoaderCircle size={16} className="spin"/> : <Download size={16}/>}
        {exporting ? '正在生成…' : '一键下载热敏打印 PDF'}
      </button>
      <button className="button secondary full gpsr-image-download" type="button" disabled={exporting || !previewValid} onClick={() => { void exportFile('png'); }}>
        <Download size={16}/>下载 PNG 图片
      </button>
      {exportMessage && <p className="export-message" role="status">{exportMessage}</p>}
    </div>
    {serviceOpen && <FeedbackDialog onClose={() => setServiceOpen(false)} title="欧盟责任人办理咨询" intro="可通过联系邮箱咨询 GPSR 欧盟责任人办理服务。"/>}
  </div>;
}
