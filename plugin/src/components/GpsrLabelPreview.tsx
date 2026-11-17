import { useEffect, useMemo, useState } from 'react';
import type { GpsrLabelData } from '../types';
import { registerPreviewFonts } from '../utils/pdf/previewFonts';
import { createGpsrLabelLayout, gpsrLabelLayoutToSvg, type GpsrLabelLayout } from '../utils/pdf/gpsrLabel';
import { Section } from './Fields';

export function GpsrLabelPreview({ data, onValidity, sectionId }: { data: GpsrLabelData; onValidity: (valid: boolean) => void; sectionId?: string }) {
  const key = JSON.stringify(data);
  const stableData = useMemo(() => JSON.parse(key) as GpsrLabelData, [key]);
  const [result, setResult] = useState<{ key: string; layout: GpsrLabelLayout | null; svg: string; errors: string[] } | null>(null);
  useEffect(() => {
    let active = true;
    onValidity(false);
    const timer = setTimeout(() => {
      void createGpsrLabelLayout(stableData).then(async (layout) => {
        await registerPreviewFonts(layout.assets);
        if (!active) return;
        setResult({ key, layout, svg: gpsrLabelLayoutToSvg(layout), errors: layout.errors });
        onValidity(layout.valid);
      }).catch((error: unknown) => {
        if (!active) return;
        console.warn('GPSR 标签预览生成失败，已阻止导出。', error);
        setResult({ key, layout: null, svg: '', errors: [error instanceof Error ? error.message : '标签尺寸或内容无效。'] });
        onValidity(false);
      });
    }, 120);
    return () => { active = false; clearTimeout(timer); };
  }, [stableData, key, onValidity]);

  const current = result?.key === key ? result : null;
  return <Section id={sectionId} title="标签预览" detail={current?.layout ? `${current.layout.width} × ${current.layout.height} mm · 2 mm 安全边距` : '正在计算排版'}>
    <div className="gpsr-preview-canvas">
      {current?.svg ? <div className="gpsr-preview-paper" dangerouslySetInnerHTML={{ __html: current.svg }}/> : <p role="status">正在使用离线字体排版…</p>}
    </div>
    <p className="helper">打印请选择实际大小 / 100%。中文品名只用于核对，不会印到标签上。</p>
    {current?.errors.length ? <div className="preview-errors" role="alert">{current.errors.map((error) => <p key={error}>{error}</p>)}</div> : null}
  </Section>;
}
