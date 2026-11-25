import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('tmp/browsers');
const { chromium, expect } = await import('@playwright/test');
const output = path.resolve('test-results/gpsr-translation');
await mkdir(output, { recursive: true });
const profileParent = path.resolve('tmp');
await mkdir(profileParent, { recursive: true });
const profile = await mkdtemp(path.join(profileParent, 'gpsr-translation-profile-'));
const extensionPath = path.resolve('dist');
const apiOrigin = new URL(process.env.VITE_GPSR_API_ORIGIN || 'http://127.0.0.1:8765');
assert.equal(apiOrigin.hostname, '127.0.0.1', '品名冒烟测试只能连接本地夹具');
assert.equal(apiOrigin.protocol, 'http:');
assert.ok(apiOrigin.port, '请配置本地夹具端口');

const emagTitle = 'Salopeta de schi femei, ofertă specială';
const emagShortName = 'Salopetă de schi pentru femei';
const offerTitle = '80-200斤吊带螺纹背心女大码修身外穿内搭打底衫无袖薄厂家直销';
const offerShortName = '女士大码罗纹吊带背心';
const requests = [];

// 本地夹具验证扩展网络权限和真实后台消息传递，无需模型密钥。
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  assert.equal(request.headers.authorization, undefined, '插件匿名调用服务');
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push({ method: request.method, path: request.url, body });
    let result;
    if (request.url === '/api/v1/gpsr/names/refine') {
      result = { name: body.sourceLanguage === 'ro' ? emagShortName : offerShortName };
    } else if (request.url === '/api/v1/gpsr/names/translate') {
      result = body.sourceLanguage === 'zh-CN'
        ? { zh: body.name, ro: 'Maiou reiat de damă', bg: 'Дамски рипсен потник', hu: 'Női bordázott trikó' }
        : { zh: '女士滑雪服', ro: body.name, bg: 'Дамски ски костюм', hu: 'Női síruha' };
    } else {
      response.writeHead(404).end('{}');
      return;
    }
    // 等待草稿落盘和同步事件，覆盖实际的慢响应场景。
    await new Promise((resolve) => setTimeout(resolve, 500));
    response.end(JSON.stringify(result));
  } catch {
    response.writeHead(400).end('{}');
  }
});

server.listen(Number(apiOrigin.port), apiOrigin.hostname);
await once(server, 'listening');
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const failures = [];
  context.on('page', (page) => page.on('pageerror', (error) => failures.push(error.message)));
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).hostname;
  await worker.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ 'emag:v1:gpsrLabel.draft': { schemaVersion: 1, value: {
      productName: { zh: '旧公司', ro: 'Old Company', bg: 'Old Company', hu: 'Old Company' },
      material: 'textile', model: 'B003', batch: 'LOT-TEST', ean13: '', manualUrl: '',
      labelSize: '70x80', customWidth: 70, customHeight: 80, orientation: 0, icons: [], warningId: 'none',
    } } });
  });
  await context.route('https://www.emag.ro/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><meta charset="utf-8"><h1 class="page-title">${emagTitle}</h1>` }));
  const product = await context.newPage();
  await product.goto('https://www.emag.ro/salopeta/pd/ABC123/');
  await product.getByRole('button', { name: '打开 eMAG 卖家工具箱' }).click();
  await product.getByRole('button', { name: 'GPSR 标签', exact: true }).click();
  assert.equal(await product.getByRole('button', { name: '品名服务设置' }).count(), 0);

  await product.getByRole('button', { name: '从当前商品导入' }).click();
  await expect(product.getByLabel('商品原始品名', { exact: true })).toHaveValue(emagTitle);
  await expect(product.getByLabel('短品名', { exact: true })).toHaveValue(emagShortName);
  assert.equal(await product.getByLabel('原文语言', { exact: true }).inputValue(), 'ro');
  assert.equal(await product.getByLabel('中文品名', { exact: true }).inputValue(), '');
  assert.equal(await product.getByLabel('保加利亚语 · BG').inputValue(), '');
  await product.getByRole('button', { name: '翻译并生成三语品名' }).click();
  await product.getByText('中文对照和三语品名已填入，请核对后再导出。', { exact: true }).waitFor();
  assert.equal(await product.getByLabel('中文品名', { exact: true }).inputValue(), '女士滑雪服');
  assert.equal(await product.getByLabel('罗马尼亚语 · RO').inputValue(), emagShortName);
  assert.equal(await product.getByLabel('保加利亚语 · BG').inputValue(), 'Дамски ски костюм');
  assert.equal(await product.getByLabel('匈牙利语 · HU').inputValue(), 'Női síruha');
  await product.locator('.drawer').screenshot({ path: path.join(output, 'translated-drawer.png') });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/manifest.json`);
  await popup.waitForFunction(async () => (await chrome.storage.local.get('emag:v1:gpsrLabel.draft'))['emag:v1:gpsrLabel.draft']?.value?.productName?.zh === '女士滑雪服');
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByLabel('商品原始品名', { exact: true })).toHaveValue(emagTitle);
  await expect(popup.getByLabel('短品名', { exact: true })).toHaveValue(emagShortName);
  await popup.getByLabel('商品原始品名', { exact: true }).fill('Alt produs');
  await expect(product.getByLabel('短品名', { exact: true })).toHaveValue('');
  await expect(product.getByLabel('保加利亚语 · BG')).toHaveValue('');
  await expect(product.getByLabel('匈牙利语 · HU')).toHaveValue('');

  const searchUrl = 'https://s.1688.com/selloffer/offer_search.htm';
  const offerUrl = 'https://detail.1688.com/offer/668369196781.html?skuId=4816466937620';
  await context.route(searchUrl, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><a href="${offerUrl}" target="_blank">打开背心详情</a>` }));
  await context.route(offerUrl, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><title>${offerTitle} - 阿里巴巴</title><h1>广州鹏尚服装有限公司</h1>` }));
  const importButton = popup.getByRole('button', { name: '从当前商品导入' });
  const search = await context.newPage();
  await search.goto(searchUrl);
  await search.bringToFront();
  await importButton.evaluate((button) => button.click());
  await expect(popup.locator('#gpsr-product [role="status"]')).toContainText('请先打开商品详情页。');
  const [offer] = await Promise.all([
    search.waitForEvent('popup'), search.getByRole('link', { name: '打开背心详情' }).click(),
  ]);
  await offer.waitForURL(offerUrl);
  await offer.bringToFront();
  // 保持商品页活动，模拟侧栏点击导入。
  await importButton.evaluate((button) => button.click());
  await expect(popup.getByLabel('商品原始品名', { exact: true })).toHaveValue(offerTitle);
  await expect(popup.getByLabel('短品名', { exact: true })).toHaveValue(offerShortName);
  await expect(popup.getByLabel('中文品名', { exact: true })).toHaveValue(offerShortName);
  await popup.getByRole('button', { name: '翻译并生成三语品名' }).click();
  await expect(popup.getByLabel('罗马尼亚语 · RO')).toHaveValue('Maiou reiat de damă');
  await expect(popup.getByLabel('保加利亚语 · BG')).toHaveValue('Дамски рипсен потник');
  await expect(popup.getByLabel('匈牙利语 · HU')).toHaveValue('Női bordázott trikó');

  assert.deepEqual(requests, [
    { method: 'POST', path: '/api/v1/gpsr/names/refine', body: { name: emagTitle, sourceLanguage: 'ro' } },
    { method: 'POST', path: '/api/v1/gpsr/names/translate', body: { name: emagShortName, sourceLanguage: 'ro' } },
    { method: 'POST', path: '/api/v1/gpsr/names/refine', body: { name: offerTitle, sourceLanguage: 'zh-CN' } },
    { method: 'POST', path: '/api/v1/gpsr/names/translate', body: { name: offerShortName, sourceLanguage: 'zh-CN' } },
  ]);
  assert.deepEqual(failures, [], '浏览器不能出现运行错误');
  console.log('GPSR 浏览器验证通过：匿名请求、eMAG 和 1688 导入提炼、短品名翻译及跨窗口同步。');
} catch (error) {
  if (context) {
    for (const page of context.pages()) {
      console.error('浏览器品名流程诊断', page.url(), await page.locator('[role="status"]').allTextContents().catch(() => []));
    }
  }
  throw error;
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
  // 仅删除本轮创建且位于测试目录中的浏览器配置，避免遗留扩展缓存影响后续验证。
  assert.equal(path.dirname(profile), profileParent);
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
