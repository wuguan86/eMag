import { useCallback, useState } from 'react';
import { Box, Check, RotateCw, ShieldCheck, X } from 'lucide-react';
import type { ProductSnapshot } from '../types';
import { ProfitCalculator } from './ProfitCalculator';
import { ComplianceWorkspace } from './ComplianceWorkspace';
import { GPSRLabelTab } from './GPSRLabelTab';
import { ErrorBoundary } from './ErrorBoundary';
import { useStorageStatus } from '../storage/hooks';
import { flushStorage } from '../storage/localStore';
import { FeedbackDialog } from './FeedbackDialog';
import complianceStyles from './compliance.css?inline';

export function Toolkit({ product, onClose, popup = false }: { product: ProductSnapshot | null; onClose?: () => void; popup?: boolean }) {
  const [tab, setTab] = useState<'product' | 'label' | 'doc'>(popup ? 'label' : 'product');
  const { error, saving } = useStorageStatus();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const closeFeedback = useCallback(() => setFeedbackOpen(false), []);
  return <div className="toolkit">
    <style>{complianceStyles}</style>
    <header className="app-header"><div className="brand-mark"><Box size={23}/></div><div className="brand-copy"><strong>eMAG <span>卖家工具箱</span></strong><small>商品洞察与包装合规</small></div>{onClose && <button className="icon-button" onClick={onClose} aria-label="收起侧栏"><X size={20}/></button>}</header>
    <nav className="tab-bar" aria-label="工具模块">{!popup && <button aria-pressed={tab === 'product'} onClick={() => setTab('product')}>商品透视</button>}<button aria-pressed={tab === 'label'} onClick={() => setTab('label')}>GPSR 标签</button><button aria-pressed={tab === 'doc'} onClick={() => setTab('doc')}>DoC 草稿</button></nav>
    <div className="workspace" key={tab}><ErrorBoundary key={tab}>
      {tab === 'product' && product && <ProfitCalculator key={product.productId} product={product}/>}
      {tab === 'label' && <GPSRLabelTab key="label" product={product}/>}
      {tab === 'doc' && <ComplianceWorkspace key="doc"/>}
    </ErrorBoundary></div>
    <footer className="app-footer">{error ? <><span className="field-error">{error}</span><button className="text-button" onClick={() => { void flushStorage(); }}>重试</button></> : <><span>{saving ? <RotateCw size={12} className="spin"/> : <Check size={12}/>} {saving ? '正在保存' : '本地保存'}</span><span><ShieldCheck size={12}/>隐私存储</span></>}</footer>
    <div className="toolkit-bottom"><p>表单保存在本机；翻译和图搜会发送所需品名或图片。</p><button className="text-button" onClick={() => setFeedbackOpen(true)}>问题反馈 / 功能定制</button></div>
    {feedbackOpen && <FeedbackDialog onClose={closeFeedback}/>}
  </div>;
}
