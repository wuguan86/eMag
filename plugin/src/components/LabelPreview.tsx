import { useEffect, useMemo, useState } from 'react';
import type { ComplianceProfile } from '../types';
import { Section } from './Fields';
import { registerPreviewFonts } from '../utils/pdf/previewFonts';

export function LabelPreview({ profile, onValidity }: { profile: ComplianceProfile; onValidity: (valid: boolean) => void }) {
  // 存储 hook 每次返回新对象，使用字段值签名避免有效性通知触发父组件重渲染循环。
  const profileKey = JSON.stringify(profile);
  const stableProfile = useMemo(() => JSON.parse(profileKey) as ComplianceProfile, [profileKey]);
  const [result, setResult] = useState<{ key: string; svg: string; errors: string[]; width: number; height: number; bodyFontSize: number; hasChinese: boolean } | null>(null);
  const [fitWidth, setFitWidth] = useState(true);
  useEffect(() => {
    let active = true;
    onValidity(false);
    const timer = setTimeout(() => { void import('../utils/pdf/layout').then(async ({ createLabelLayout, labelLayoutToSvg }) => {
      const layout = await createLabelLayout(stableProfile);
      await registerPreviewFonts(layout.assets);
      if (!active) return;
      setResult({ key: profileKey, svg: labelLayoutToSvg(layout), errors: layout.errors, width: layout.width, height: layout.height, bodyFontSize: layout.bodyFontSize, hasChinese: layout.hasChinese });
      onValidity(layout.valid);
    }).catch((error: unknown) => {
      if (!active) return;
      console.warn('标签预览生成失败，已阻止导出。', error);
      setResult({ key: profileKey, svg: '', errors: ['标签预览生成失败，请检查字符或重新打开插件。'], width: 0, height: 0, bodyFontSize: 6, hasChinese: false });
      onValidity(false);
    }); }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [stableProfile, profileKey, onValidity]);
  const current = result?.key === profileKey ? result : null;
  return <Section title="打印预览" detail={current?.svg ? `${current.width} × ${current.height} mm · 正文 ${current.bodyFontSize}pt` : '正在计算排版'}>
    <div className="preview-toolbar" role="group" aria-label="标签预览缩放">
      <button type="button" aria-pressed={fitWidth} onClick={() => setFitWidth(true)}>适应宽度</button>
      <button type="button" aria-pressed={!fitWidth} onClick={() => setFitWidth(false)}>100%</button>
      <span>2 mm 打印边距</span>
    </div>
    <div className="label-preview">
      {current?.svg ? <div className="label-preview-paper" style={{ width: fitWidth ? '100%' : `${current.width}mm` }} dangerouslySetInnerHTML={{ __html: current.svg }}/> : <p role="status">正在使用离线字体计算排版…</p>}
    </div>
    {current?.hasChinese ? <p className="preview-language-warning" role="note" style={{ background: '#fff8dc', color: '#80611a', border: '1px solid #f2dda3', borderRadius: 8, padding: '10px 12px', fontSize: 12, lineHeight: 1.6 }}>提示：发往欧洲的实物包装标签请勿印刷中文，建议使用英文或罗/匈/保当地语言。</p> : null}
    <p className="helper">预览缩放不影响 PDF 尺寸。打印请选择实际大小 / 100%。</p>
    {current?.errors.length ? <div className="preview-errors" role="alert">{current.errors.map((error) => <p key={error}>{error}</p>)}</div> : null}
  </Section>;
}

export default LabelPreview;
