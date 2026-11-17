import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

// 使用 Vite 的 Node 模块加载器运行真实生成 API，无需浏览器、字体服务或内容脚本。
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { createLabelPdf, createDeclarationPdf } = await server.ssrLoadModule('/src/utils/pdf/export.ts');
  const { createLabelLayout, labelLayoutToSvg } = await server.ssrLoadModule('/src/utils/pdf/layout.ts');
  const { sampleProfile, sampleDraft, labelSamples } = await server.ssrLoadModule('/scripts/pdf-fixtures.ts');
  const output = resolve('tmp/pdfs');
  await mkdir(output, { recursive: true });
  const manifest = [];
  for (const sample of labelSamples) {
    const layout = await createLabelLayout(sample.profile);
    assert.equal(layout.valid, sample.expectedValid, `${sample.name} 有效性不符合预期：${layout.errors.join(' ')}`);
    manifest.push({ name: sample.name, valid: layout.valid, width: layout.width, height: layout.height, bodyFontSize: layout.bodyFontSize, hasChinese: layout.hasChinese, errors: layout.errors, lines: layout.lines, icons: layout.icons });
    if (!layout.valid) {
      await assert.rejects(createLabelPdf(sample.profile), /超出/);
      assert.ok(!/<text|<path/.test(labelLayoutToSvg(layout)), '超容预览不得绘制无效内容');
      console.log(`已确认 ${sample.name} 阻止导出：${layout.errors.join(' ')}`);
      continue;
    }
    const doc = await createLabelPdf(sample.profile);
    await writeFile(resolve(output, `${sample.name}.pdf`), new Uint8Array(doc.output('arraybuffer')));
    await writeFile(resolve(output, `${sample.name}.svg`), labelLayoutToSvg(layout));
    console.log(`已生成 ${sample.name}，正文 ${layout.bodyFontSize}pt。`);
  }
  await writeFile(resolve(output, 'label-manifest.json'), JSON.stringify(manifest, null, 2));
  for (const long of [false, true]) {
    const draft = { ...sampleDraft, legislation: long ? 'Regulation text. '.repeat(1800) + 'END-LEGISLATION' : sampleDraft.legislation };
    const doc = await createDeclarationPdf(sampleProfile, draft);
    await writeFile(resolve(output, long ? 'declaration-long.pdf' : 'declaration.pdf'), new Uint8Array(doc.output('arraybuffer')));
    console.log(`已生成声明草稿，共 ${doc.getNumberOfPages()} 页。`);
  }
} finally { await server.close(); }
