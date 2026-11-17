import { useState } from 'react';
import { ArrowUpRight, Calculator, Download, ImageOff, Info } from 'lucide-react';
import type { ProductSnapshot, ProfitSettings } from '../types';
import { calculateProfit, defaultProfitSettings } from '../utils/profit';
import { isNonnegative, isNullableNonnegative, useLocalValue } from '../storage/hooks';
import { NumberField, Section } from './Fields';
import { isAwaitingProductContent } from '../utils/productStatus';
import { downloadBlob, fetchJpegImage } from '../utils/imageDownload';
import { blobToBase64, buildImageSearchUrl } from '../utils/imageSearchProtocol';
import { marketVatRates, matchCommission } from '../config/commissionRules';
import { normalizeReference } from '../utils/productMetadata';
import profitStyles from './profit.css?inline';

const validMode = (value: unknown): value is ProfitSettings['shippingMode'] => value === 'fixed' || value === 'weight';
const positive = (value: unknown): value is number => isNonnegative(value) && value > 0;
const percentage = (value: unknown): value is number => isNonnegative(value) && value <= 100;
const rate = (value: unknown): value is number => isNonnegative(value) && value <= 1;
const nullableRate = (value: unknown): value is number | null => value === null || rate(value);
const validMarket = (value: unknown): value is ProfitSettings['market'] => ['RO', 'HU', 'BG'].includes(String(value));
const validFulfillment = (value: unknown): value is ProfitSettings['fulfillmentMode'] => value === 'fbm' || value === 'fbe';

export function ProfitCalculator({ product }: { product: ProductSnapshot }) {
  const [exchangeRate, setExchangeRate] = useLocalValue('profit.exchangeRate', defaultProfitSettings.exchangeRate, positive);
  const [vatRate, setVatRate] = useLocalValue('profit.vatRate', defaultProfitSettings.vatRate, (value): value is number => isNonnegative(value) && value <= 1);
  const [commissionOverride, setCommissionOverride] = useLocalValue<number | null>(`commission.${product.productId}`, null, nullableRate);
  const matchedCommission = matchCommission(product.breadcrumbs);
  const commissionRate = commissionOverride ?? matchedCommission.rate;
  const [market, setMarket] = useLocalValue('profit.market', defaultProfitSettings.market, validMarket);
  const [fulfillmentMode, setFulfillmentMode] = useLocalValue('profit.fulfillmentMode', defaultProfitSettings.fulfillmentMode, validFulfillment);
  const [fbmLocalFeeRon, setFbmLocalFeeRon] = useLocalValue('profit.fbmLocalFeeRon', 0, isNonnegative);
  const [fbeLocalFeeRon, setFbeLocalFeeRon] = useLocalValue('profit.fbeLocalFeeRon', 15, isNonnegative);
  const localFeeRon = fulfillmentMode === 'fbe' ? fbeLocalFeeRon : fbmLocalFeeRon;
  const setLocalFeeRon = fulfillmentMode === 'fbe' ? setFbeLocalFeeRon : setFbmLocalFeeRon;
  const [settlementLossRate, setSettlementLossRate] = useLocalValue('profit.settlementLossRate', defaultProfitSettings.settlementLossRate, rate);
  const [smallOrderThresholdRon, setSmallOrderThresholdRon] = useLocalValue('profit.smallOrderThresholdRon', defaultProfitSettings.smallOrderThresholdRon, positive);
  const [includeSmallOrderFee, setIncludeSmallOrderFee] = useLocalValue('profit.includeSmallOrderFee', false, (value): value is boolean => typeof value === 'boolean');
  const [shippingMode, setShippingMode] = useLocalValue('profit.shippingMode', 'fixed' as ProfitSettings['shippingMode'], validMode);
  const [shippingRmb, setShippingRmb] = useLocalValue('profit.shippingRmb', 12, isNonnegative);
  const [weightKg, setWeightKg] = useLocalValue<number | null>('profit.weightKg', null, isNullableNonnegative);
  const [ratePerKg, setRatePerKg] = useLocalValue<number | null>('profit.ratePerKg', null, isNullableNonnegative);
  const [procurementRmb, setProcurementRmb] = useLocalValue<number | null>(`cost.${product.productId}`, null, isNullableNonnegative);
  const [saleOverride, setSaleOverride] = useState<number | null>(null);
  const [saleRevision, setSaleRevision] = useState(0);
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [imageStatus, setImageStatus] = useState<'idle' | 'preparing' | 'ready' | 'error'>('idle');
  const [imageError, setImageError] = useState('');
  const priceRon = saleOverride ?? product.priceRon;
  const awaitingContent = isAwaitingProductContent(product);
  const result = Object.values(invalid).some(Boolean) ? null : calculateProfit({ priceRon, procurementRmb, exchangeRate, vatRate, commissionRate, shippingMode, shippingRmb, weightKg, ratePerKg, market, fulfillmentMode, localFeeRon, settlementLossRate, smallOrderThresholdRon, includeSmallOrderFee });
  const whiteLabel = product.brandName && ['oem', 'generic', 'fara brand'].includes(normalizeReference(product.brandName));
  const smallOrder = priceRon !== null && priceRon > 0 && priceRon < smallOrderThresholdRon;
  const validity = (key: string) => (valid: boolean) => setInvalid((current) => ({ ...current, [key]: !valid }));
  const prepareImageSearch = () => {
    if (!product.imageUrl || imageStatus === 'preparing') return;
    const jobId = crypto.randomUUID();
    const imageSearchTab = window.open(buildImageSearchUrl(jobId), '_blank');
    if (!imageSearchTab) {
      setImageError('浏览器阻止了新标签页，请允许此站点打开弹出窗口后重试。');
      setImageStatus('error');
      return;
    }
    imageSearchTab.opener = null;
    setImageStatus('preparing');
    setImageError('');
    void (async () => {
      let jpeg: Blob | null = null;
      try {
        jpeg = await fetchJpegImage(product.imageUrl!);
        const fileName = `emag-${product.productId}.jpg`;
        const imageBase64 = await blobToBase64(jpeg);
        const response = await chrome.runtime.sendMessage({ type: 'QUEUE_1688_IMAGE_SEARCH', jobId, fileName, imageBase64 });
        if (!response?.ok) throw new Error(response?.error ?? '扩展无法将图片交给 1688 页面。');
        setImageStatus('ready');
      } catch (error) {
        if (jpeg) downloadBlob(jpeg, `emag-${product.productId}.jpg`);
        setImageError(`${error instanceof Error ? error.message : 'JPEG图片准备失败，请重试。'}${jpeg ? ' 已下载 JPEG，可在 1688 手动上传。' : ''}`);
        setImageStatus('error');
      }
    })();
  };
  return <>
    <style>{profitStyles}</style>
    <Section title="当前商品" detail={awaitingContent ? '等待页面内容' : product.missingFields.length ? '解析不全' : '已读取页面'}>
      <div className="product-summary">
        {product.imageUrl ? <img className="product-image" src={product.imageUrl} alt="商品主图" referrerPolicy="no-referrer"/> : <div className="product-image placeholder"><ImageOff size={24}/></div>}
        <div className="product-copy"><h3>{product.title ?? '未读取到商品标题'}</h3><div className="price">{product.priceRon?.toFixed(2) ?? '—'} <small>RON</small></div></div>
      </div>
      <dl className="facts"><div><dt>类目</dt><dd>{product.breadcrumbs?.join(' / ') ?? '未识别'}</dd></div><div><dt>品牌</dt><dd>{product.brandName ?? '品牌未识别'}</dd></div>
        <div><dt>销售方</dt><dd>{product.sellerName ?? '未识别'}</dd></div>
        <div><dt>其他报价</dt><dd>{product.otherOfferCount ?? '未识别'}</dd></div>
        {product.lowestOtherOfferRon !== null && product.lowestOtherOfferRon !== undefined && <div><dt>报价试算</dt><dd><button className="text-button" onClick={() => {
          setSaleOverride(product.lowestOtherOfferRon); setSaleRevision((value) => value + 1);
          setInvalid((current) => ({ ...current, sale: false }));
        }}>最低报价: {product.lowestOtherOfferRon.toFixed(2)} RON · 点击填入</button></dd></div>}</dl>
      <div className="risk-badges">
        {product.isEmagSeller === true && <span className="badge red">eMAG 自营（跟卖高风险）</span>}
        {product.brandName && <span className={`badge ${whiteLabel ? 'green' : 'orange'}`}>{whiteLabel ? '白牌/OEM，可评估跟卖' : `品牌商品（${product.brandName}），跟卖需品牌授权`}</span>}
      </div>
      {product.missingFields.length > 0 && <p className="notice amber"><Info size={14}/>{awaitingContent ? '尚未读取到商品内容；请等待页面加载，如出现真人验证请完成后等待自动重试。' : '部分字段未读取，请核对商品页；未知数量不代表没有跟卖。'}</p>}
      <button className="button primary full" onClick={prepareImageSearch} disabled={!product.imageUrl || imageStatus === 'preparing'}>
        {imageStatus === 'preparing' ? '正在上传并搜索' : '🔍 一键 1688 搜同款货源'} {imageStatus === 'preparing' ? <Download size={16}/> : <ArrowUpRight size={16}/>}
      </button>
      {imageStatus === 'ready' && <p className="muted" role="status">图片任务已交给 1688。请查看新标签页的自动上传状态提示和搜索结果。</p>}
      {imageStatus === 'error' && <p className="field-error" role="alert">{imageError}</p>}
    </Section>
    <Section title="利润试算" detail="失焦或按 Enter 更新">
      <div className="field"><label htmlFor="profit-market">VAT 参考站点</label><select id="profit-market" value={market} onChange={(event) => {
        const next = event.target.value as ProfitSettings['market']; setMarket(next); setVatRate(marketVatRates[next]);
        setInvalid((current) => ({ ...current, vat: false }));
      }}><option value="RO">RO (21%)</option><option value="HU">HU (27%)</option><option value="BG">BG (20%)</option></select><p className="helper">仅切换 VAT 参考税率；金额统一按 RON 试算。</p></div>
      <div className="form-grid">
        <NumberField key={saleRevision} label="销售价" value={priceRon} suffix="RON" positive onCommit={setSaleOverride} onValidity={validity('sale')}/>
        <NumberField label="采购成本" value={procurementRmb} suffix="RMB" allowEmpty onCommit={setProcurementRmb} onValidity={validity('cost')}/>
        <NumberField label="汇率 · 1 RON" value={exchangeRate} suffix="RMB" positive onCommit={(value) => { if (value !== null) setExchangeRate(value); }} onValidity={validity('exchange')}/>
        <NumberField key={market} label="VAT 税率" value={vatRate * 100} suffix="%" max={100} onCommit={(value) => { if (value !== null && percentage(value)) setVatRate(value / 100); }} onValidity={validity('vat')}/>
        <NumberField key={commissionOverride === null ? 'auto' : 'manual'} label="平台佣金率" value={commissionRate * 100} suffix="%" max={100} onCommit={(value) => { if (value !== null) setCommissionOverride(value / 100); }} onValidity={validity('commission')}/>
        <div className="field"><label htmlFor="fulfillment-mode">履约模式</label><select id="fulfillment-mode" value={fulfillmentMode} onChange={(event) => {
          setFulfillmentMode(event.target.value as ProfitSettings['fulfillmentMode']); setInvalid((current) => ({ ...current, localFee: false }));
        }}><option value="fbm">自发货 (FBM)</option><option value="fbe">官方仓 (FBE)</option></select></div>
        <div className="field"><label htmlFor="shipping-mode">头程计费</label><select id="shipping-mode" value={shippingMode} onChange={(event) => { setShippingMode(event.target.value as ProfitSettings['shippingMode']); setInvalid((current) => ({ ...current, shipping: false, weight: false, rate: false })); }}><option value="fixed">固定单件运费</option><option value="weight">按重量计费</option></select></div>
        {shippingMode === 'fixed' ? <NumberField label="单件运费" value={shippingRmb} suffix="RMB" onCommit={(value) => { if (value !== null) setShippingRmb(value); }} onValidity={validity('shipping')}/>
          : <><NumberField label="单件重量" value={weightKg} suffix="kg" positive allowEmpty onCommit={setWeightKg} onValidity={validity('weight')}/><NumberField label="每公斤运费" value={ratePerKg} suffix="RMB/kg" allowEmpty onCommit={setRatePerKg} onValidity={validity('rate')}/></>}
        <NumberField key={fulfillmentMode} label="FBE / 当地费用" value={localFeeRon} suffix="RON" onCommit={(value) => { if (value !== null) setLocalFeeRon(value); }} onValidity={validity('localFee')}/>
        <NumberField label="结汇损耗" value={Number((settlementLossRate * 100).toFixed(8))} suffix="%" max={100} onCommit={(value) => { if (value !== null) setSettlementLossRate(value / 100); }} onValidity={validity('settlement')}/>
        <NumberField label="小额订单门槛" value={smallOrderThresholdRon} suffix="RON" positive onCommit={(value) => { if (value !== null) setSmallOrderThresholdRon(value); }} onValidity={validity('threshold')}/>
      </div>
      <p className="commission-hint">{commissionOverride === null ? matchedCommission.category ? `已按类目自动匹配（可手动调整）· ${matchedCommission.category}` : '未匹配类目，采用 16% 参考值（可手动调整）' : <>已手动调整 · <button className="text-button" onClick={() => { setCommissionOverride(null); setInvalid((current) => ({ ...current, commission: false })); }}>恢复类目匹配</button></>}</p>
      <div className={smallOrder ? 'notice amber small-order' : 'notice small-order'}>
        <label><input type="checkbox" checked={includeSmallOrderFee} onChange={(event) => setIncludeSmallOrderFee(event.target.checked)}/>计入小额订单 2% 附加费</label>
        <span>{smallOrder ? `当前售价低于 ${smallOrderThresholdRon} RON（默认约 50 EUR），可勾选计入。` : '达到门槛时不收取；仅作为平台费用参考，请核对合同。'}</span>
      </div>
      <div className={`profit-result ${result?.status ?? 'pending'}`} aria-live="polite">
        <div className="result-top"><span><Calculator size={15}/>预估净利润</span><span className="badge">{result ? ({ high: '高利', low: '微利', loss: '亏损' })[result.status] : '待完善'}</span></div>
        <div className="result-value">{result ? result.netProfitRmb.toFixed(2) : '—'} <small>RMB</small></div>
        <div className="result-bottom"><span>净利率 {result ? `${result.marginPercent.toFixed(2)}%` : '—'}</span><span>运费 {result ? result.shippingRmb.toFixed(2) : '—'} RMB</span></div>
      </div>
      {!result && <p className="muted">请填写售价、采购成本及运费参数，并修正无效输入。</p>}
      <details className="formula"><summary>查看计算口径</summary>
        <p>VAT 税金 = 含税销售价 − 含税销售价 ÷ (1 + VAT 税率)</p>
        <p>平台佣金 = 含税销售价 × (平台佣金率 + 实际生效的小额附加费率)</p>
        <p>人民币净回款 = (含税销售价 − VAT 税金 − 平台佣金 − 当地费用) × 汇率 × (1 − 结汇损耗率)</p>
        <p>预估净利润 = 人民币净回款 − 采购成本 − 头程单件运费</p>
        <p>净利率 = 预估净利润 ÷ (含税销售价 × 汇率) × 100%</p>
        {result && <dl className="profit-breakdown">
          <div><dt>VAT 税金</dt><dd>{result.vatRon.toFixed(2)} RON</dd></div>
          <div><dt>平台佣金（含小额费）</dt><dd>{result.commissionRon.toFixed(2)} RON</dd></div>
          <div><dt>小额附加费率</dt><dd>{result.smallOrderFeeRate * 100}%</dd></div>
          <div><dt>当地费用</dt><dd>{result.localFeeRon.toFixed(2)} RON</dd></div>
          <div><dt>结汇损耗</dt><dd>{result.settlementLossRmb.toFixed(2)} RMB</dd></div>
          <div><dt>人民币净回款</dt><dd>{result.netRemittanceRmb.toFixed(2)} RMB</dd></div>
          <div><dt>采购成本</dt><dd>{procurementRmb?.toFixed(2)} RMB</dd></div>
          <div><dt>头程单件运费</dt><dd>{result.shippingRmb.toFixed(2)} RMB</dd></div>
        </dl>}
        <p>≥20% 为高利。费用和佣金为参考值，不自动联网更新；未计入广告、退货等其他费用。</p>
      </details>
    </Section>
  </>;
}
