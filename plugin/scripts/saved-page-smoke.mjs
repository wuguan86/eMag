import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('tmp/browsers');
const { chromium } = await import('@playwright/test');
const capturePath = path.resolve(process.argv[2] ?? 'tmp/emag-product.html');
const html = await readFile(capturePath, 'utf8');
// 不执行保存页面的脚本，也不读取或复制用户浏览器的会话。
const document = new JSDOM(html).window.document;
const productUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
assert.ok(productUrl?.includes('/pd/DLY2KR2BM/'), '此复验脚本针对用户提供的 Columbia 商品页面');
const originalImage = document.querySelector('#product-gallery [data-ph-id="image-0"] a')?.getAttribute('href');
assert.ok(originalImage);
const output = path.resolve('test-results');
await mkdir(output, { recursive: true });
const extensionPath = path.resolve(process.env.EMAG_EXTENSION_PATH || 'dist');
const imageSearchFixture = await readFile(path.resolve('tests/fixtures/1688-image-search.html'), 'utf8');
const context = await chromium.launchPersistentContext(path.resolve(process.env.EMAG_BROWSER_PROFILE || 'tmp/saved-page-profile'), {
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
try {
  await context.route('https://**/*', async (route) => {
    const request = route.request();
    const requestedUrl = new URL(request.url());
    if (request.url() === originalImage) {
      return route.fulfill({ contentType: 'image/avif', body: await readFile(path.resolve('tests/fixtures/persil.avif')),
        headers: { 'access-control-allow-origin': '*' } });
    }
    if (requestedUrl.hostname === 'www.emag.ro' && request.isNavigationRequest()) {
      const body = requestedUrl.searchParams.has('waitForProduct') ? '<!doctype html><meta charset="utf-8"><p>正在等待商品内容</p>' : html;
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body,
        headers: { 'Content-Security-Policy': "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src 'none'" } });
    }
    if (requestedUrl.hostname === 'air.1688.com' && request.isNavigationRequest()) {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: imageSearchFixture });
    }
    if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' });
    return route.abort();
  });
  const page = await context.newPage();
  const failures = [];
  const warnings = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => { if (message.type() === 'warning' && message.text().includes('商品解析')) warnings.push(message.text()); });
  const waitingMessage = page.waitForEvent('console', { predicate: (message) => message.type() === 'info' && message.text().startsWith('尚未读取到商品内容') });
  await page.goto(`${productUrl}?waitForProduct=1`);
  await page.getByRole('button', { name: '打开 eMAG 卖家工具箱', exact: true }).click();
  await page.getByText('等待页面内容', { exact: true }).waitFor();
  await waitingMessage;
  assert.deepEqual(warnings, [], '加载或验证期间不能生成全字段缺失错误');
  await page.evaluate((source) => {
    const parsed = new DOMParser().parseFromString(source, 'text/html');
    // innerHTML 插入的脚本保持惰性，仅供内容脚本静态解析；不执行保存页面代码。
    document.head.innerHTML = parsed.head.innerHTML;
    document.body.innerHTML = parsed.body.innerHTML;
  }, html);
  await page.locator('.price').filter({ hasText: '159.99' }).waitFor();
  const facts = await page.locator('.facts').innerText();
  assert.match(facts, /eMAG/);
  assert.match(facts, /0/);
  assert.match(facts, /Columbia/);
  assert.match(facts, /Sport & Travel/);
  assert.ok(!facts.includes('未识别'), facts);
  await page.getByText('eMAG 自营（跟卖高风险）', { exact: true }).waitFor();
  await page.getByText('品牌商品（Columbia），跟卖需品牌授权', { exact: true }).waitFor();
  assert.equal(await page.locator('.product-image').getAttribute('src'), originalImage);
  assert.equal(await page.locator('#emag-seller-toolkit-root').count(), 1);
  await page.locator('.drawer.open').screenshot({ path: path.join(output, 'saved-page-drawer.png'), animations: 'disabled' });
  const searchPagePromise = context.waitForEvent('page');
  await page.getByRole('button', { name: '🔍 一键 1688 搜同款货源', exact: true }).click();
  const searchPage = await searchPagePromise;
  await page.getByText('图片任务已交给 1688', { exact: false }).waitFor();
  await searchPage.waitForFunction(() => {
    try { return JSON.parse(document.querySelector('#search-result')?.textContent ?? '').status === '自动搜索已提交'; }
    catch { return false; }
  }, null, { timeout: 15_000 });
  const submittedImage = JSON.parse(await searchPage.locator('#search-result').textContent());
  assert.equal(submittedImage.name, 'emag-DLY2KR2BM.jpg');
  assert.equal(submittedImage.type, 'image/jpeg');
  assert.ok(submittedImage.size > 1000);
  assert.deepEqual(submittedImage.header, [0xff, 0xd8, 0xff]);
  assert.equal(await searchPage.locator('#upload-count').textContent(), '(1/6)');
  assert.equal(await searchPage.locator('#plus-error').textContent(), '');
  await searchPage.close();
  const initialWarnings = [...warnings];
  assert.deepEqual(initialWarnings, [], '完整商品数据不应继续告警');
  // 模拟站内换品：旧脚本仍在时计数须清空；新商品身份就绪后可接受相同零值。
  await page.evaluate(() => { history.pushState({}, '', '/next/pd/NEW999/'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByText('未读取到商品标题', { exact: true }).waitFor();
  await page.locator('.facts > div:last-child > dd').filter({ hasText: '未识别' }).waitFor();
  await page.evaluate(() => {
    document.querySelector('h1').textContent = '商品切换验证';
    for (const script of document.scripts) {
      if (script.textContent.includes('EM.multiple_offers_count =')) {
        script.textContent = 'EM.url = {"path":"/next/pd/NEW999/"};\nEM.pnk = "NEW999";\nEM.has_multiple_offers = false;\nEM.offers_count = 1;\nEM.multiple_offers_count = 0;';
      }
    }
  });
  await page.waitForFunction(() => document.querySelector('#emag-seller-toolkit-root')?.shadowRoot?.querySelector('.facts > div:last-child > dd')?.textContent === '0');
  assert.deepEqual(failures, [], '保存页面回放出现未处理异常');
  await writeFile(path.join(output, 'saved-page-check.json'), JSON.stringify({ capturePath, productUrl, priceRon: 159.99,
    sellerName: 'eMAG', otherOfferCount: 0, originalImage, unhandledErrors: failures,
    initialParseWarnings: initialWarnings, initialLoading: '等待状态及延迟补齐通过，无全字段错误', productSwitch: '通过', imageSearch: '本地 AVIF 主图交给模拟 1688 页面并自动上传、点击搜索', scope: '保存的真实 HTML 离线回放；未验证在线动态请求或1688远程结果' }, null, 2));
  console.log('真实保存页面回放通过：等待状态、延迟补齐、159.99 RON、eMAG、其他报价0、图库原图、AVIF转JPEG、自动上传和搜索、商品切换及初始解析无告警。在线动态请求和1688远程货源结果未验证。');
} finally { await context.close(); }
