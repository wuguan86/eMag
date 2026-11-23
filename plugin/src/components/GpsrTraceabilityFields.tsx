import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { GpsrLabelDraft } from '../types';
import { gpsrBarcodeValidationMessage, isValidGpsrBarcode, renderGpsrBarcode } from '../utils/gpsrBarcode';
import { isValidManualUrl } from '../utils/gpsrLabel';
import { Section, TextField } from './Fields';

export function GpsrTraceabilityFields({ draft, onField, sectionId }: {
  draft: GpsrLabelDraft;
  onField: <Key extends keyof GpsrLabelDraft>(key: Key, value: GpsrLabelDraft[Key]) => void;
  sectionId?: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [qrResult, setQrResult] = useState<{ url: string; dataUrl: string } | null>(null);
  const barcode = draft.ean13;
  const barcodeValid = isValidGpsrBarcode(barcode);
  const urlValid = isValidManualUrl(draft.manualUrl);

  useEffect(() => {
    if (svg.current && barcodeValid) renderGpsrBarcode(svg.current, barcode, 36);
  }, [barcode, barcodeValid]);

  useEffect(() => {
    let active = true;
    if (!draft.manualUrl || !isValidManualUrl(draft.manualUrl)) return;
    void QRCode.toDataURL(draft.manualUrl, { errorCorrectionLevel: 'H', margin: 1, width: 256 })
      .then((value) => { if (active) setQrResult({ url: draft.manualUrl, dataUrl: value }); })
      .catch(() => { if (active) setQrResult({ url: draft.manualUrl, dataUrl: '' }); });
    return () => { active = false; };
  }, [draft.manualUrl]);
  const qrDataUrl = qrResult?.url === draft.manualUrl ? qrResult.dataUrl : '';

  return <Section id={sectionId} title="追溯码与说明书">
    <TextField label="EAN / UPC 商品码" value={barcode} onChange={(value) => onField('ean13', value)} optional placeholder="12 或 13 位数字"/>
    {barcode && !barcodeValid && <p className="field-error" role="alert">{gpsrBarcodeValidationMessage}</p>}
    {barcodeValid && <div className="gpsr-barcode-preview"><svg ref={svg} aria-label="Code 128 条码预览"/><span>{barcode}</span></div>}
    <TextField label="说明书 / 安全声明 URL" value={draft.manualUrl} onChange={(value) => onField('manualUrl', value)} optional maxLength={2000} placeholder="https://example.com/manual.pdf"/>
    {draft.manualUrl && !urlValid && <p className="field-error" role="alert">请输入有效的 HTTP(S) 网页或 PDF 地址。</p>}
    {qrDataUrl && <div className="gpsr-qr-preview"><img src={qrDataUrl} alt="说明书二维码预览"/><span>User Manual / Info</span></div>}
  </Section>;
}
