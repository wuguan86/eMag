import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('tmp/browsers');
const { chromium, expect } = await import('@playwright/test');
const output = path.resolve('test-results/gpsr-translation');
await mkdir(output, { recursive: true });
const extensionPath = path.resolve('dist');
// 使用独立配置与翻译响应夹具，验证真实扩展消息链路，不发送用户数据或消耗免费额度。
const context = await chromium.launchPersistentContext(path.resolve('tmp/gpsr-translation-profile'), {
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
const failures = [];
context.on('page', (page) => page.on('pageerror', (error) => failures.push(error.message)));
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).hostname;
  await worker.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ 'emag:v1:gpsrLabel.draft': { schemaVersion: 1, value: {
      productName: { zh: '旧公司', ro: 'Old Company', bg: 'Old Company', hu: 'Old Company' },
      material: 'textile', model: 'B003', batch: 'LOT-TEST', ean13: '', manualUrl: '',
      labelSize: '70x80', customWidth: 70, customHeight: 80, orientation: 0, icons: [], warningId: 'none',
    } } });
    const originalFetch = globalThis.fetch;
    globalThis.translationPairs = [];
    globalThis.fetch = async (input, options) => {
      const url = new URL(String(input));
      if (url.hostname !== 'api.mymemory.translated.net') return originalFetch(input, options);
      const pair = url.searchParams.get('langpair');
      globalThis.translationPairs.push(pair);
      const names = { 'ro|zh-CN': '女士滑雪服', 'ro|bg': 'Дамски ски костюм', 'ro|hu': 'Női síruha' };
      // 模拟真实慢响应，确保草稿保存与 onChanged 回声发生在翻译返回之前。
      await new Promise((resolve) => setTimeout(resolve, 700));
      return Response.json({ responseStatus: 200, responseData: { translatedText: names[pair] } });
    };
  });
  await context.route('https://www.emag.ro/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><h1 class="page-title">Salopeta de schi femei</h1>' }));
  const product = await context.newPage();
  await product.goto('https://www.emag.ro/salopeta/pd/ABC123/');
  await product.getByRole('button', { name: '打开 eMAG 卖家工具箱' }).click();
  await product.getByRole('button', { name: 'GPSR 标签', exact: true }).click();
  await product.getByRole('button', { name: '从当前商品导入' }).click();
  await product.getByText('已导入商品标题并清除旧译文，请确认原文语言后翻译。', { exact: true }).waitFor();
  assert.equal(await product.getByLabel('原文语言', { exact: true }).inputValue(), 'ro');
  assert.equal(await product.getByLabel('中文品名', { exact: true }).inputValue(), '');
  assert.equal(await product.getByLabel('保加利亚语 · BG').inputValue(), '');
  assert.equal(await product.getByLabel('罗马尼亚语 · RO').inputValue(), 'Salopeta de schi femei');
  await product.getByRole('button', { name: '翻译并生成三语品名' }).click();
  await product.getByText('中文对照和三语品名已填入，请核对后再导出。', { exact: true }).waitFor();
  assert.equal(await product.getByLabel('中文品名', { exact: true }).inputValue(), '女士滑雪服');
  assert.equal(await product.getByLabel('保加利亚语 · BG').inputValue(), 'Дамски ски костюм');
  assert.equal(await product.getByLabel('匈牙利语 · HU').inputValue(), 'Női síruha');
  assert.equal(await product.getByText('中文对照：女士滑雪服', { exact: true }).count(), 3);
  assert.deepEqual((await worker.evaluate(() => globalThis.translationPairs)).sort(), ['ro|bg', 'ro|hu', 'ro|zh-CN']);
  await product.locator('.drawer').screenshot({ path: path.join(output, 'translated-drawer.png') });

  const popup = await context.newPage();
  // 内容脚本与宿主脚本处于不同世界，在扩展页面等待草稿落盘后再打开表单。
  await popup.goto(`chrome-extension://${extensionId}/manifest.json`);
  await popup.waitForFunction(async () => (await chrome.storage.local.get('emag:v1:gpsrLabel.draft'))['emag:v1:gpsrLabel.draft']?.value?.productName?.zh === '女士滑雪服');
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByText('中文对照：女士滑雪服', { exact: true }).first().waitFor();
  assert.equal(await popup.getByLabel('商品原始品名', { exact: true }).inputValue(), 'Salopeta de schi femei');
  await popup.getByLabel('商品原始品名', { exact: true }).fill('Alt produs');
  await product.getByText('中文对照：尚未生成，请翻译或填写中文品名', { exact: true }).first().waitFor();
  assert.equal(await product.getByLabel('保加利亚语 · BG').inputValue(), '');
  assert.equal(await product.getByLabel('匈牙利语 · HU').inputValue(), '');

  const searchUrl = 'https://s.1688.com/selloffer/offer_search.htm';
  const offerUrl = 'https://detail.1688.com/offer/668369196781.html?skuId=4816466937620';
  const offerTitle = '80-200斤吊带螺纹背心女大码修身外穿内搭打底衫无袖薄厂家直销';
  await context.route(searchUrl, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><a href="${offerUrl}" target="_blank">打开背心详情</a>` }));
  await context.route(offerUrl, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><title>${offerTitle} - 阿里巴巴</title><h1>广州鹏尚服装有限公司</h1>` }));
  await popup.reload();
  const importButton = popup.getByRole('button', { name: '从当前商品导入' });
  await importButton.waitFor();
  const search = await context.newPage();
  await search.goto(searchUrl);
  await search.bringToFront();
  const importStatus = popup.locator('#gpsr-product [role="status"]');
  await importButton.evaluate((button) => button.click());
  await expect(importStatus).toContainText('请先打开商品详情页。');
  const [offer] = await Promise.all([
    search.waitForEvent('popup'),
    search.getByRole('link', { name: '打开背心详情' }).click(),
  ]);
  await offer.waitForURL(offerUrl);
  await offer.bringToFront();
  // 保持新商品标签页处于活动状态，模拟侧栏按钮操作，无需在新标签页点击工具栏图标授权 activeTab。
  await importButton.evaluate((button) => button.click());
  await expect(importStatus).toHaveText('已导入商品标题并清除旧译文，请确认原文语言后翻译。');
  assert.equal(await popup.getByLabel('商品原始品名', { exact: true }).inputValue(), offerTitle);
  assert.equal(await popup.getByLabel('中文品名', { exact: true }).inputValue(), offerTitle);

  assert.deepEqual(failures, [], '浏览器不能出现运行错误');
  console.log('GPSR 浏览器验证通过：eMAG 导入与三语翻译、跨窗口清除旧译文、1688 搜索结果打开新标签页后导入。');
} finally {
  await context.close();
}
