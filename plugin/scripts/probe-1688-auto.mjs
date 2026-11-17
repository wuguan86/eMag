import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// 此可选检查会把仓库中的公开 Persil 商品图上传到真实 1688；使用独立测试会话。
const context = await chromium.launchPersistentContext(path.resolve('tmp/online-auto-profile'), {
  headless: true, channel: 'chromium',
  args: [`--disable-extensions-except=${path.resolve('dist')}`, `--load-extension=${path.resolve('dist')}`],
});
try {
  await mkdir('test-results', { recursive: true });
  await context.route('https://www.emag.ro/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8',
    body: '<h1 class="page-title">公开商品图测试</h1><div class="product-gallery"><img src="https://images.example/main.jpg"></div><div class="product-highlight"><p class="product-new-price">89,99 Lei</p></div>' }));
  const sourceImage = await readFile('tests/fixtures/persil.avif');
  await context.route('https://images.example/**', (route) => route.fulfill({ contentType: 'image/avif', body: sourceImage,
    headers: { 'access-control-allow-origin': '*' } }));
  const source = await context.newPage();
  await source.goto('https://www.emag.ro/probe/pd/AUTO123/');
  await source.getByRole('button', { name: '打开 eMAG 卖家工具箱' }).click();
  const targetPromise = context.waitForEvent('page');
  await source.getByRole('button', { name: '🔍 一键 1688 搜同款货源' }).click();
  const target = await targetPromise;
  await target.waitForFunction(() => new URL(location.href).searchParams.has('imageId')
    || [...document.documentElement.children].some((host) => /自动图搜未完成/.test(host.shadowRoot?.textContent ?? '')),
  null, { timeout: 65_000 });
  assert.ok(new URL(target.url()).searchParams.get('imageId'), '真实1688未取得图片ID，自动上传或搜索失败');
  await target.waitForFunction(() => /上传图片\s*\(\s*1\s*\/6\)/.test(document.body.innerText)
    && /找到以下货源/.test(document.body.innerText) && /Persil/i.test(document.body.innerText), null, { timeout: 30_000 });
  const report = await target.evaluate(() => ({ url: location.href, body: document.body.innerText.slice(0, 1800) }));
  await writeFile('test-results/1688-online-auto.json', JSON.stringify({ ...report,
    scope: 'eMAG为夹具；真实1688独立会话、真实上传与结果展示；不验证同款或报价准确性' }, null, 2));
  await target.screenshot({ path: 'test-results/1688-online-auto.png' });
  console.log('真实1688自动图搜通过：取得图片ID、显示1/6并加载商品结果；eMAG来源使用公开商品夹具。');
} finally { await context.close(); }
