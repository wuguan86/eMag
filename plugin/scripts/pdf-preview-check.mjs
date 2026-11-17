import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('tmp/browsers');
const { chromium } = await import('@playwright/test');
const output = path.resolve('test-results');
await mkdir(output, { recursive: true });
const server = await createServer({ configFile: false, appType: 'custom', server: { host: '127.0.0.1', port: 0 } });
server.middlewares.use('/pdf-preview-check', async (_request, response) => {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module">
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { LabelPreview } from '/src/components/LabelPreview.tsx';
    import { createLabelLayout } from '/src/utils/pdf/layout.ts';
    import { sampleProfile, compactProfile } from '/scripts/pdf-fixtures.ts';
    const samples = [
      { name: 'kerning', profile: { ...sampleProfile, productName: 'AV'.repeat(25) } },
      { name: 'ligatures', profile: { ...sampleProfile, productName: 'office affine fi fl ffi ffl AV fi office' } },
      { name: 'mixed', profile: { ...sampleProfile, productName: '中文标签 Șurubelniță Țară Încărcător 中文' } },
      { name: 'wide-kerning', profile: { ...sampleProfile, productName: 'AV'.repeat(36), labelSize: '100x100' } },
      { name: 'five-icons', profile: { ...compactProfile, warningId: 'under3' } },
      { name: 'custom-warning', profile: { ...compactProfile, warningId: 'custom', customWarning: 'RO: Atenție! EN: Keep <away> & safe.' } },
      { name: 'chinese-warning', profile: { ...compactProfile, warningId: 'custom', customWarning: '中文警示' } },
      { name: 'overflow-warning', profile: { ...compactProfile, warningId: 'custom', customWarning: '超长中文警示 EN: Warning. '.repeat(300) } },
    ];
    window.pdfPreviewChecks = [];
    for (const { name, profile } of samples) {
      const layout = await createLabelLayout(profile);
      const state = { name, ready: false, valid: layout.valid, hasChinese: layout.hasChinese, width: layout.width, height: layout.height, iconCount: layout.icons.length, inkBounds: layout.valid ? layout.lines.map(line => line.bounds) : [], expected: layout.valid ? layout.lines.map(line => line.runs.reduce((sum, run) => sum + run.width, 0)) : [] };
      window.pdfPreviewChecks.push(state);
      const host = document.createElement('div');
      host.dataset.case = name; document.body.append(host);
      const shadow = host.attachShadow({mode:'open'});
      const mount = document.createElement('div'); shadow.append(mount);
      createRoot(mount).render(React.createElement(LabelPreview, {profile, onValidity: valid => { state.ready = valid; }}));
    }
  </script></body></html>`;
  response.setHeader('Content-Type', 'text/html');
  response.setHeader('Content-Security-Policy', "font-src 'none'");
  response.end(await server.transformIndexHtml('/pdf-preview-check', html));
});
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  const address = server.httpServer.address();
  await page.goto(`http://127.0.0.1:${address.port}/pdf-preview-check`);
  await page.waitForFunction(() => window.pdfPreviewChecks?.length === 8 && window.pdfPreviewChecks.every((sample) => {
    const shadow = document.querySelector('[data-case="' + sample.name + '"]')?.shadowRoot;
    return sample.valid ? sample.ready : Boolean(shadow?.querySelector('.preview-errors'));
  }));
  const result = await page.evaluate(() => ({
    fonts: [...document.fonts].map((font) => ({ family: font.family, status: font.status })),
    cases: window.pdfPreviewChecks.map((sample) => {
      const shadow = document.querySelector('[data-case="' + sample.name + '"]').shadowRoot;
      const svg = shadow.querySelector('.label-preview-paper > svg');
      const texts = [...svg.querySelectorAll(':scope > text')];
      const bounds = (element) => {
        const box = element.getBBox();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      return { name: sample.name, valid: sample.valid, width: sample.width, height: sample.height, expectedLineCount: sample.expected.length, iconCount: sample.iconCount, hasChinese: sample.hasChinese, languageWarning: Boolean(shadow.querySelector('.preview-language-warning')), paperContainsHint: svg.textContent.includes('提示：发往欧洲'), paths: svg.querySelectorAll('path').length, icons: [...svg.querySelectorAll(':scope > svg')].map(icon => ({ x: Number(icon.getAttribute('x')), y: Number(icon.getAttribute('y')), width: Number(icon.getAttribute('width')), height: Number(icon.getAttribute('height')) })), lines: texts.map((text, index) => ({
        expectedMm: sample.expected[index], actualMm: text.getComputedTextLength(),
        fontBox: bounds(text), inkBounds: sample.inkBounds[index],
        differenceMm: Math.abs(sample.expected[index] - text.getComputedTextLength()),
        kerning: getComputedStyle(text).fontKerning, ligatures: getComputedStyle(text).fontVariantLigatures,
      })) };
    }),
  }));
  assert.deepEqual(failures, [], '预览页面不能出现异常');
  for (const family of ['EmagToolkitNotoSans', 'EmagToolkitDroidFallback']) {
    assert.ok(result.fonts.some((font) => font.family === family && font.status === 'loaded'), `${family} 未实际加载`);
  }
  for (const sample of result.cases) {
    assert.equal(sample.languageWarning, sample.hasChinese, `${sample.name} 中文提醒不匹配`);
    assert.equal(sample.paperContainsHint, false, '中文提示不得印在标签内');
    assert.equal(sample.lines.length, sample.expectedLineCount, `${sample.name} 文字行数不匹配`);
    assert.equal(sample.icons.length, sample.valid ? sample.iconCount : 0, `${sample.name} 图标数量不匹配`);
    if (!sample.valid) assert.equal(sample.paths, 0, '无效预览不得绘制图标');
    const iconTop = sample.icons.length ? Math.min(...sample.icons.map(icon => icon.y)) : sample.height - 1.5;
    for (const [index, line] of sample.lines.entries()) {
      assert.ok(line.differenceMm < 0.1, `${sample.name} 宽度误差 ${line.differenceMm} 毫米`);
      assert.equal(line.kerning, 'none'); assert.equal(line.ligatures, 'none');
      // 浏览器 getBBox 返回整字体行框，实际墨迹边界以同一离线 TTF 的 glyf 轮廓为准。
      assert.ok(line.inkBounds.left >= 1.99999 && line.inkBounds.top >= 1.99999, `${sample.name} 字形越过左/上边距`);
      assert.ok(line.inkBounds.right <= sample.width - 1.99999, `${sample.name} 字形越过右边距`);
      assert.ok(line.inkBounds.bottom <= iconTop - 0.49999, `${sample.name} 字形侵入图标区域`);
      if (index) assert.ok(line.inkBounds.top >= sample.lines[index - 1].inkBounds.bottom, `${sample.name} 字形行之间重叠`);
    }
    for (const [index, icon] of sample.icons.entries()) {
      assert.ok(icon.x >= 2 && icon.y >= 2 && icon.x + icon.width <= sample.width - 2 && icon.y + icon.height <= sample.height - 2, `${sample.name} 图标越过打印边距`);
      for (const other of sample.icons.slice(index + 1)) assert.ok(icon.x + icon.width <= other.x, `${sample.name} 图标重叠`);
    }
  }
  await writeFile(path.join(output, 'pdf-preview-metrics.json'), JSON.stringify(result, null, 2));
  await page.screenshot({ path: path.join(output, 'pdf-preview-shadow.png'), fullPage: true });
  console.log(`Shadow DOM 字体和文字宽度验证通过，最大误差 ${Math.max(...result.cases.flatMap((sample) => sample.lines.map((line) => line.differenceMm))).toFixed(6)} 毫米。`);
} finally { await browser.close(); await server.close(); }
