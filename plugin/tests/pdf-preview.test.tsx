import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LabelPreview } from '../src/components/LabelPreview';
import { compactProfile, sampleProfile } from '../scripts/pdf-fixtures';

afterEach(cleanup);

describe('标签预览状态', () => {
  it('中文提醒位于纸张外且有效性不被中文阻断', async () => {
    const onValidity = vi.fn();
    const view = render(<LabelPreview profile={{ ...compactProfile, warningId: 'custom', customWarning: '中文警示' }} onValidity={onValidity}/>);
    await waitFor(() => expect(onValidity).toHaveBeenLastCalledWith(true), { timeout: 4000 });
    const message = view.getByText('提示：发往欧洲的实物包装标签请勿印刷中文，建议使用英文或罗/匈/保当地语言。');
    expect(message.closest('.label-preview-paper')).toBeNull();
    expect(view.container.querySelector('svg')?.textContent).not.toContain('提示：');
    view.unmount();
  });
  it('最终输出没有中文时不提示，未选中的自定义中文不会误报', async () => {
    const onValidity = vi.fn();
    const view = render(<LabelPreview profile={{ ...compactProfile, warningId: 'none', customWarning: '未选择的中文警示' }} onValidity={onValidity}/>);
    await waitFor(() => expect(onValidity).toHaveBeenLastCalledWith(true), { timeout: 4000 });
    expect(view.queryByText(/提示：发往欧洲/)).toBeNull();
    view.unmount();
  });
  it('超容时清除无效纸张内容且仍显示中文提醒和区域错误', async () => {
    const onValidity = vi.fn();
    const view = render(<LabelPreview profile={{ ...sampleProfile, warningId: 'custom', customWarning: '中文警示'.repeat(200) }} onValidity={onValidity}/>);
    await waitFor(() => expect(view.getByRole('alert').textContent).toContain('自定义警示语区域超出'), { timeout: 4000 });
    expect(view.container.querySelectorAll('svg text, svg path')).toHaveLength(0);
    expect(view.getByText(/提示：发往欧洲/)).toBeTruthy();
    expect(onValidity).toHaveBeenLastCalledWith(false);
    view.unmount();
  });
  it('等待 ArrayBuffer 字体加载并注册到文档后才通知预览有效', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const faces: { family: string; source: unknown }[] = [];
    class PendingFontFace {
      constructor(public family: string, public source: unknown) { faces.push(this); }
      async load() { await gate; return this; }
    }
    const add = vi.fn();
    const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    vi.stubGlobal('FontFace', PendingFontFace);
    Object.defineProperty(document, 'fonts', { configurable: true, value: { add } });
    const onValidity = vi.fn();
    const view = render(<LabelPreview profile={sampleProfile} onValidity={onValidity}/>);
    try {
      await waitFor(() => expect(faces).toHaveLength(2), { timeout: 4000 });
      expect(onValidity).not.toHaveBeenCalledWith(true);
      expect(faces.map((face) => face.family)).toEqual(['EmagToolkitNotoSans', 'EmagToolkitDroidFallback']);
      expect(faces.every((face) => face.source instanceof ArrayBuffer)).toBe(true);
      release();
      await waitFor(() => expect(onValidity).toHaveBeenLastCalledWith(true));
      expect(add).toHaveBeenCalledTimes(2);
    } finally {
      release(); view.unmount(); vi.unstubAllGlobals();
      if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
      else Reflect.deleteProperty(document, 'fonts');
    }
  });
  it('相同字段的新对象不会重启排版或再次通知父组件', async () => {
    const onValidity = vi.fn();
    const view = render(<LabelPreview profile={{ ...sampleProfile }} onValidity={onValidity}/>);
    await waitFor(() => expect(onValidity).toHaveBeenLastCalledWith(true), { timeout: 4000 });
    const count = onValidity.mock.calls.length;
    view.rerender(<LabelPreview profile={{ ...sampleProfile }} onValidity={onValidity}/>);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(onValidity).toHaveBeenCalledTimes(count);
    view.unmount();
  });
});
