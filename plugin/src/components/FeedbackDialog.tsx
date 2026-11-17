import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { feedbackConfig, getExtensionVersion } from '../config/feedback';

export function FeedbackDialog({ onClose, title = '问题反馈 / 功能定制', intro }: { onClose: () => void; title?: string; intro?: string }) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const copyWechat = async () => {
    if (!feedbackConfig.wechat) return;
    try {
      // 仅在用户点击时写入微信号，避免读取或覆盖无关剪贴板内容。
      await navigator.clipboard.writeText(feedbackConfig.wechat);
      setCopyStatus('success');
    } catch (error) {
      console.warn('复制微信号失败，请手动复制。', error);
      setCopyStatus('error');
    }
  };
  useEffect(() => {
    const current = dialog.current!;
    const previousFocus = current.getRootNode() instanceof ShadowRoot
      ? (current.getRootNode() as ShadowRoot).activeElement : document.activeElement;
    const focusable = () => [...current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')];
    focusable()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // 原生监听器先于抽屉处理按键，关闭反馈时不会同时收起抽屉。
        event.preventDefault(); event.stopPropagation(); onClose();
      } else if (event.key === 'Tab') {
        const elements = focusable();
        const active = current.getRootNode() instanceof ShadowRoot ? (current.getRootNode() as ShadowRoot).activeElement : document.activeElement;
        const index = elements.indexOf(active as HTMLElement);
        event.preventDefault();
        elements[(index + (event.shiftKey ? -1 : 1) + elements.length) % elements.length]?.focus();
      }
    };
    current.addEventListener('keydown', handleKey);
    return () => {
      current.removeEventListener('keydown', handleKey);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [onClose]);
  const qrCode = feedbackConfig.qrCodePath;
  const qrCodeUrl = qrCode && globalThis.chrome?.runtime ? chrome.runtime.getURL(qrCode) : qrCode;
  return <div className="feedback-backdrop">
    <div ref={dialog} className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="feedback-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="关闭反馈" onClick={onClose}><X size={18}/></button></div>
      {intro ? <p>{intro}</p> : <p>欢迎反馈使用问题，或咨询 <strong>eMAG 定制开发</strong>。</p>}
      <dl className="feedback-details"><div><dt>微信</dt><dd className="feedback-wechat"><span>{feedbackConfig.wechat || '待配置'}</span>{feedbackConfig.wechat && <button type="button" className="feedback-copy" onClick={copyWechat}>{copyStatus === 'success' ? '已复制' : '复制'}</button>}</dd></div><div><dt>当前版本</dt><dd>{getExtensionVersion()}</dd></div></dl>
      <p className="helper" role="status">{copyStatus === 'error' ? '复制失败，请手动复制微信号。' : copyStatus === 'success' ? '微信号已复制，可粘贴到微信添加好友。' : ''}</p>
      {qrCodeUrl ? <img className="feedback-qr" src={qrCodeUrl} alt="微信联系二维码"/> : <div className="feedback-qr-placeholder">联系二维码待配置</div>}
      <p className="helper">表单保存在本机；翻译和图搜会发送所需品名或图片。</p>
    </div>
  </div>;
}
