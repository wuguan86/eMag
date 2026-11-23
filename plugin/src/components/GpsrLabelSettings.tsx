import { useId } from 'react';
import type { GpsrLabelDraft } from '../types';
import { Section } from './Fields';

export function GpsrLabelSettings({ draft, onField, sectionId }: {
  draft: GpsrLabelDraft;
  onField: <Key extends keyof GpsrLabelDraft>(key: Key, value: GpsrLabelDraft[Key]) => void;
  sectionId?: string;
}) {
  const sizeId = useId();
  return <Section id={sectionId} title="标签尺寸与安全信息">
    <div className="gpsr-size-orientation">
      <div className="field"><label htmlFor={sizeId}>打印尺寸</label><select id={sizeId} value={draft.labelSize} onChange={(event) => onField('labelSize', event.target.value as GpsrLabelDraft['labelSize'])}>
        <option value="70x80">70 × 80 mm · 推荐</option><option value="80x80">80 × 80 mm · 方形大标</option>
        <option value="100x100">100 × 100 mm · 外箱大标</option><option value="custom">自定义尺寸</option>
      </select></div>
      <fieldset className="gpsr-orientation"><legend>出纸方向</legend>
        <button type="button" aria-pressed={draft.orientation === 0} onClick={() => onField('orientation', 0)}>0° · 纵向</button>
        <button type="button" aria-pressed={draft.orientation === 90} onClick={() => onField('orientation', 90)}>90° · 横向</button>
      </fieldset>
    </div>
    {draft.labelSize === 'custom' && <div className="gpsr-two-column">
      <div className="field"><label htmlFor="gpsr-custom-width">宽度</label><div className="input-wrap"><input id="gpsr-custom-width" type="number" min={70} max={5000} value={draft.customWidth} onChange={(event) => onField('customWidth', Number(event.target.value))}/><span>mm</span></div></div>
      <div className="field"><label htmlFor="gpsr-custom-height">高度</label><div className="input-wrap"><input id="gpsr-custom-height" type="number" min={80} max={5000} value={draft.customHeight} onChange={(event) => onField('customHeight', Number(event.target.value))}/><span>mm</span></div></div>
    </div>}
    <div className="field"><span className="field-label">标签固定内容</span><p className="helper">CE · 0–3 岁警示标志 · RO / BG / HU 塑料袋防窒息警示</p></div>
  </Section>;
}
