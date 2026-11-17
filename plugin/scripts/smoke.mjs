import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const project = process.cwd();
const output = path.join(project, 'test-results');
await mkdir(output, { recursive: true });
const extensionPath = path.join(project, 'dist');
const context = await chromium.launchPersistentContext(path.join(project, 'tmp', 'smoke-profile'), {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  viewport: { width: 1440, height: 1000 },
});
const failures = [];
context.on('page', (page) => { page.on('pageerror', (error) => failures.push(error.message)); });
try {
  const manager = await context.newPage();
  await manager.goto('chrome://extensions/');
  const extension = manager.locator('extensions-item').filter({ hasText: 'eMAG 卖家工具箱' });
  await extension.waitFor();
  const extensionId = await extension.getAttribute('id');
  assert.ok(extensionId, '浏览器未加载扩展');

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 432, height: 600 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.evaluate(() => chrome.storage.local.clear());
  await popup.reload();
  await popup.getByRole('heading', { name: '产品信息', exact: true }).waitFor();
  assert.equal(await popup.evaluate(() => chrome.runtime.getManifest().permissions.join(',')), 'storage');
  await popup.getByLabel('产品名称', { exact: true }).fill('Produs de test');
  await popup.getByLabel('型号 · Model', { exact: true }).fill('M-01');
  await popup.getByLabel('批次号 · Batch No.', { exact: true }).fill('B-2026');
  const companies = popup.getByLabel('公司名称', { exact: true });
  await companies.nth(0).fill('Example EU SRL');
  await companies.nth(1).fill('深圳示例制造有限公司');
  await popup.getByLabel('欧盟实体地址', { exact: true }).fill('Str. Test 1, București, RO');
  await popup.getByLabel('国内实体地址', { exact: true }).fill('中国广东省深圳市南山区测试路1号');
  const emails = popup.getByLabel('联系邮箱', { exact: true });
  await emails.nth(0).fill('eu@example.com'); await emails.nth(1).fill('cn@example.com');
  await popup.getByLabel('打印尺寸', { exact: true }).selectOption('100x100');
  await popup.getByLabel('双语警示语', { exact: true }).selectOption('choking');
  await popup.getByRole('checkbox', { name: 'CE 标志', exact: true }).check();
  const downloadPromise = popup.waitForEvent('download');
  await popup.getByRole('button', { name: '一键导出打印 PDF', exact: true }).click();
  await (await downloadPromise).saveAs(path.join(output, 'label-browser.pdf'));
  await popup.locator('.label-preview').screenshot({ path: path.join(output, 'popup-label-preview.png'), animations: 'disabled' });
  await popup.locator('.workspace').evaluate((element) => { element.scrollTop = 0; });
  await popup.screenshot({ path: path.join(output, 'popup-label.png'), animations: 'disabled' });
  await popup.getByLabel('打印尺寸', { exact: true }).selectOption('50x30');
  await popup.getByRole('button', { name: '一键导出打印 PDF', exact: true }).waitFor({ state: 'visible' });
  await popup.waitForFunction(() => document.querySelector('.export-area button')?.disabled === true);

  await popup.getByRole('button', { name: 'DoC 草稿', exact: true }).click();
  await popup.getByLabel('产品描述', { exact: true }).fill('Portable test accessory');
  await popup.getByLabel('适用法规', { exact: true }).fill('Applicable legislation entered by the user');
  await popup.getByLabel('协调标准', { exact: true }).fill('Standards entered by the user');
  await popup.getByLabel('声明地点', { exact: true }).fill('București');
  await popup.getByLabel('声明日期', { exact: true }).fill('2026-11-12');
  await popup.getByLabel('签署人姓名', { exact: true }).fill('Test Person');
  await popup.getByLabel('职务', { exact: true }).fill('Director');
  const declarationDownload = popup.waitForEvent('download');
  await popup.getByRole('button', { name: '导出 A4 DoC 草稿', exact: true }).click();
  await (await declarationDownload).saveAs(path.join(output, 'declaration-browser.pdf'));

  const product = await context.newPage();
  const imageRoot = 'https://images.example/main.jpg';
  const avifFixture = await readFile(path.join(project, 'tests', 'fixtures', 'persil.avif'));
  await context.route('https://images.example/**', (route) => route.fulfill({
    contentType: 'image/avif', body: avifFixture, headers: { 'access-control-allow-origin': '*' },
  }));
  await context.route('https://s.1688.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>旧版1688入口夹具</title>' }));
  const imageSearchFixture = await readFile(path.join(project, 'tests/fixtures/1688-image-search.html'), 'utf8');
  let missingTopControl = false;
  await context.route('https://air.1688.com/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8',
    body: missingTopControl ? imageSearchFixture.replace('class="search-image-upload-container"', 'class="removed-top-control"') : imageSearchFixture }));
  await context.route('https://www.emag.ro/**', (route) => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; font-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' https:"><style>
      html{font-size:40px}*{font-family:serif!important;color:magenta!important}button{padding:80px!important;background:yellow!important}
      </style></head><body><h1 class="page-title">Fixture Product</h1>
      <div class="product-pictures-gallery"><img src="${imageRoot}?width=80&amp;amp;height=80&amp;amp;hash=thumb"></div>
      <div class="product-gallery"><div class="carousel"><img id="main-image" src="${imageRoot}?width=1000&amp;amp;height=1000&amp;amp;hash=signed%2Bvalue"></div></div>
      <div class="product-highlight"><p class="product-new-price">129<sup>99</sup> Lei</p></div>
      <div class="product-seller">Vândut de Partener și livrat de eMAG</div>
      <ol class="breadcrumb"><li>Fashion</li><li>Ghete barbati</li></ol><a class="product-brand-link"><img alt="Generic"><span>Vezi toate produsele</span></a>
      <div id="other-offers">Alte 3 oferte<p class="product-new-price">119<sup>90</sup> Lei</p><del class="product-new-price">1 Lei</del></div></body></html>`,
  }));
  await product.goto('https://www.emag.ro/fixture/pd/ABC123/');
  const launcher = product.getByRole('button', { name: '打开 eMAG 卖家工具箱' });
  await launcher.waitFor();
  assert.equal(await product.locator('#emag-seller-toolkit-root').evaluate((host) => host.childElementCount), 0);
  assert.equal(await launcher.evaluate((element) => getComputedStyle(element).fontSize), '12px');
  assert.notEqual(await launcher.evaluate((element) => getComputedStyle(element).color), 'rgb(255, 0, 255)');
  await launcher.click();
  await product.locator('.drawer.open').waitFor({ state: 'visible' });
  const sellerFacts = await product.locator('.facts').innerText();
  assert.ok(sellerFacts.includes('Partener'), `销售方不能被配送方覆盖：${JSON.stringify({ facts: sellerFacts, text: await product.locator('.product-seller').textContent(), charset: await product.evaluate(() => document.characterSet) })}`);
  await product.getByText('白牌/OEM，可评估跟卖', { exact: true }).waitFor();
  assert.equal(await product.locator('.badge.green').evaluate((element) => getComputedStyle(element).color), 'rgb(21, 115, 90)', '风险样式必须进入Shadow DOM');
  assert.equal(await product.getByLabel('平台佣金率', { exact: true }).inputValue(), '17');
  await product.getByRole('button', { name: '最低报价: 119.90 RON · 点击填入', exact: true }).click();
  assert.equal(await product.getByLabel('销售价', { exact: true }).inputValue(), '119.9');
  assert.equal(await product.locator('.product-image').getAttribute('src'), `${imageRoot}?width=1000&height=1000&hash=signed%2Bvalue`);
  await product.locator('#main-image').evaluate((element) => element.setAttribute('data-zoom-image', 'https://images.example/main.jpg?width=1600&amp;height=1600&amp;hash=zoom%2Bvalue'));
  await product.waitForFunction(() => document.querySelector('#emag-seller-toolkit-root')?.shadowRoot?.querySelector('.product-image')?.getAttribute('src')?.includes('width=1600'));
  const searchPagePromise = context.waitForEvent('page');
  await product.getByRole('button', { name: '🔍 一键 1688 搜同款货源', exact: true }).click();
  const searchPage = await searchPagePromise;
  const imageSearchLogs = [];
  searchPage.on('console', (message) => imageSearchLogs.push(`${message.type()}: ${message.text()}`));
  searchPage.on('pageerror', (error) => imageSearchLogs.push(`pageerror: ${error.message}`));
  await product.getByText('图片任务已交给 1688', { exact: false }).waitFor();
  const searchUrl = new URL(searchPage.url());
  assert.equal(searchUrl.hostname, 'air.1688.com', '必须打开可自动化的1688图片搜索页');
  assert.equal(searchUrl.pathname, '/kapp/1688-search/pc-image-search/');
  assert.equal(searchUrl.searchParams.get('tab'), 'imageSearch');
  await searchPage.waitForFunction(() => {
    try { return JSON.parse(document.querySelector('#search-result')?.textContent ?? '').status === '自动搜索已提交'; }
    catch { return false; }
  }, null, { timeout: 15_000 }).catch(async (error) => {
    const status = await searchPage.evaluate(() => [...document.documentElement.children].map((host) => host.shadowRoot?.textContent ?? '').join(''));
    throw new Error(`1688自动上传状态异常: ${status}; 页面=${await searchPage.locator('body').innerText()}; 控制台=${imageSearchLogs.join(' | ')}`, { cause: error });
  });
  const submittedImage = JSON.parse(await searchPage.locator('#search-result').textContent());
  assert.equal(submittedImage.name, 'emag-ABC123.jpg');
  assert.equal(submittedImage.type, 'image/jpeg');
  assert.ok(submittedImage.size > 1000, `上传图片字节数异常：${submittedImage.size}`);
  assert.deepEqual(submittedImage.header, [0xff, 0xd8, 0xff], '上传内容必须是 JPEG 字节');
  assert.equal(await searchPage.locator('#upload-count').textContent(), '(1/6)');
  assert.equal(await searchPage.locator('#plus-error').textContent(), '', '不得走失败的中部加号上传入口');
  await searchPage.waitForFunction(() => location.hash === '', null, { timeout: 15_000 });
  await searchPage.close();
  missingTopControl = true;
  const fallbackPagePromise = context.waitForEvent('page');
  await product.getByRole('button', { name: '🔍 一键 1688 搜同款货源', exact: true }).click();
  const fallbackPage = await fallbackPagePromise;
  await fallbackPage.getByText('自动图搜未完成：等待顶部“以图搜款”文件输入框超时。', { exact: false }).waitFor({ timeout: 30_000 });
  assert.equal(await fallbackPage.locator('#plus-error').textContent(), '', '顶部失效后也不得尝试中部加号');
  const fallbackDownloadPromise = fallbackPage.waitForEvent('download');
  await fallbackPage.getByRole('button', { name: '下载 JPEG，手动上传', exact: true }).click();
  const fallbackDownload = await fallbackDownloadPromise;
  const fallbackPath = path.join(output, '1688-fallback.jpg');
  await fallbackDownload.saveAs(fallbackPath);
  assert.deepEqual([...(await readFile(fallbackPath)).subarray(0, 3)], [0xff, 0xd8, 0xff]);
  await fallbackPage.close();
  assert.equal(await product.locator('#emag-seller-toolkit-root').count(), 1, '异步主图更新不能重复挂载');
  await product.getByLabel('采购成本', { exact: true }).fill('30');
  await product.getByLabel('采购成本', { exact: true }).press('Enter');
  await product.locator('.profit-result.high').waitFor();
  await product.screenshot({ path: path.join(output, 'drawer-isolation.png'), animations: 'disabled' });
  await product.getByRole('button', { name: '收起侧栏' }).click();
  assert.equal(await launcher.evaluate((element) => element.getRootNode().activeElement === element), true, '收起后焦点没有返回启动按钮');
  await launcher.click();
  await product.getByLabel('采购成本', { exact: true }).press('Escape');
  assert.equal(await launcher.getAttribute('aria-expanded'), 'false');
  assert.equal(await launcher.evaluate((element) => element.getRootNode().activeElement === element), true, 'Esc 后焦点没有返回启动按钮');
  await launcher.click();
  await product.getByRole('button', { name: 'GPSR 标签', exact: true }).click();
  await product.getByLabel('打印尺寸', { exact: true }).selectOption('100x100');
  await product.getByLabel('产品名称', { exact: true }).fill('AV'.repeat(25));
  await product.waitForFunction(() => {
    const preview = document.querySelector('#emag-seller-toolkit-root')?.shadowRoot?.querySelector('.label-preview text');
    return preview?.textContent === 'AV'.repeat(25) && [...document.fonts].filter((font) => font.family.startsWith('EmagToolkit')).length === 2;
  });
  const textMetrics = await product.locator('.label-preview text').first().evaluate((element) => ({
    width: element.getComputedTextLength(), fontSizeMm: Number(element.getAttribute('font-size')),
  }));
  // 夹具在 6pt 下的独立字体基准；自适应字号改变后，仍须核对浏览器与 PDF 度量的一致性。
  const expectedWidth = 65.56375 * textMetrics.fontSizeMm / (6 * 25.4 / 72);
  assert.ok(Math.abs(textMetrics.width - expectedWidth) < 0.1, `隔离层预览字宽与 PDF 不一致：${textMetrics.width}`);
  const paper = product.locator('.label-preview-paper');
  const fitWidth = await paper.evaluate((element) => element.getBoundingClientRect().width);
  await product.getByRole('button', { name: '100%', exact: true }).click();
  const actualWidth = await paper.evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(Math.abs(actualWidth - 100 * 96 / 25.4) < 0.1, '100% 预览应保留所选标签尺寸');
  assert.notEqual(actualWidth, fitWidth, '切换预览缩放必须改变屏幕显示宽度');
  await product.getByRole('button', { name: '适应宽度', exact: true }).click();
  assert.equal(await paper.evaluate((element) => element.getBoundingClientRect().width), fitWidth, '适应宽度应恢复原显示宽度');
  await product.locator('.section').filter({ has: product.getByRole('heading', { name: '打印预览', exact: true }) }).screenshot({ path: path.join(output, 'label-preview-controls.png'), animations: 'disabled' });
  const drawerDownload = product.waitForEvent('download');
  await product.getByRole('button', { name: '一键导出打印 PDF', exact: true }).click();
  await (await drawerDownload).saveAs(path.join(output, 'label-drawer.pdf'));
  const repSection = product.locator('.section').filter({ has: product.getByRole('heading', { name: '欧盟责任人 · EU REP', exact: true }) });
  await repSection.getByLabel('新模板名称', { exact: true }).fill('常用欧盟主体');
  await repSection.getByRole('button', { name: '保存为新模板', exact: true }).click();
  const firstTemplateId = await repSection.getByRole('option', { name: '常用欧盟主体（默认）', exact: true }).getAttribute('value');
  await repSection.getByLabel('公司名称', { exact: true }).fill('Temporary EU Name');
  await product.getByRole('button', { name: 'DoC 草稿', exact: true }).click();
  const docRep = product.locator('.section').filter({ has: product.getByRole('heading', { name: '欧盟责任人 · EU REP', exact: true }) });
  assert.equal(await docRep.getByLabel('公司名称', { exact: true }).inputValue(), 'Temporary EU Name');
  await docRep.getByLabel('新模板名称', { exact: true }).fill('备用欧盟主体');
  await docRep.getByRole('button', { name: '保存为新模板', exact: true }).click();
  await docRep.getByRole('button', { name: '设为默认', exact: true }).click();
  await docRep.screenshot({ path: path.join(output, 'upgrade-templates.png'), animations: 'disabled' });
  await docRep.getByLabel('EU REP 模板', { exact: true }).selectOption(firstTemplateId);
  assert.equal(await docRep.getByLabel('公司名称', { exact: true }).inputValue(), 'Example EU SRL');
  await docRep.getByRole('button', { name: '删除模板', exact: true }).click();
  assert.equal(await docRep.getByLabel('公司名称', { exact: true }).inputValue(), 'Example EU SRL', '删除模板不清空当前草稿');
  await docRep.getByLabel('公司名称', { exact: true }).fill('Edited EU Draft');
  // 对照扩展存储等到写入完成，再重开页面验证草稿优先于默认模板。
  await popup.waitForFunction(async () => (await chrome.storage.local.get('emag:v1:profile.euRep.name'))['emag:v1:profile.euRep.name']?.value === 'Edited EU Draft');
  await popup.reload();
  const popupRep = popup.locator('.section').filter({ has: popup.getByRole('heading', { name: '欧盟责任人 · EU REP', exact: true }) });
  await popup.waitForFunction(() => [...document.querySelectorAll('input')].some((input) => input.value === 'Edited EU Draft'));
  assert.equal(await popupRep.getByLabel('公司名称', { exact: true }).inputValue(), 'Edited EU Draft');
  await popup.getByLabel('产品名称', { exact: true }).fill('Shared Product');
  await product.getByRole('button', { name: 'GPSR 标签', exact: true }).click();
  await product.waitForFunction(() => document.querySelector('#emag-seller-toolkit-root').shadowRoot.querySelector('input')?.value === 'Shared Product');
  await product.getByLabel('打印尺寸', { exact: true }).selectOption('70x40');
  await product.getByLabel('公司名称', { exact: true }).nth(0).fill('EU SRL');
  await product.getByLabel('欧盟实体地址', { exact: true }).fill('Str. Unirii 1, București, RO');
  await product.getByLabel('联系邮箱', { exact: true }).nth(0).fill('eu@example.ro');
  await product.getByLabel('公司名称', { exact: true }).nth(1).fill('Factory');
  await product.getByLabel('国内实体地址', { exact: true }).fill('10 Road, Shenzhen, CN');
  await product.getByLabel('联系邮箱', { exact: true }).nth(1).fill('factory@example.cn');
  await product.getByLabel('双语警示语', { exact: true }).selectOption('general');
  for (const label of ['CE 标志', 'WEEE 垃圾桶', '0–3 岁禁玩', 'Triman 回收', 'PAP 20']) {
    await product.getByRole('checkbox', { name: new RegExp(label) }).check();
  }
  await product.getByRole('button', { name: '一键导出打印 PDF', exact: true }).waitFor();
  await product.waitForFunction(() => document.querySelector('#emag-seller-toolkit-root').shadowRoot.querySelector('.export-area button')?.disabled === false);
  const denseDownload = product.waitForEvent('download');
  await product.getByRole('button', { name: '一键导出打印 PDF', exact: true }).click();
  await (await denseDownload).saveAs(path.join(output, 'upgrade-label-70x40.pdf'));
  await product.locator('.section').filter({ has: product.getByRole('heading', { name: '打印预览', exact: true }) }).screenshot({ path: path.join(output, 'upgrade-label-70x40.png'), animations: 'disabled' });
  await product.getByLabel('双语警示语', { exact: true }).selectOption('custom');
  await product.getByLabel('自定义警示语', { exact: true }).fill('中文提醒');
  await product.getByText('提示：发往欧洲的实物包装标签请勿印刷中文，建议使用英文或罗/匈/保当地语言。', { exact: true }).waitFor();
  await product.waitForFunction(() => document.querySelector('#emag-seller-toolkit-root').shadowRoot.querySelector('.export-area button')?.disabled === false);
  await product.getByRole('button', { name: 'DoC 草稿', exact: true }).click();
  await product.getByLabel('插入常见品类法规参考示例（需自行核对）', { exact: true }).selectOption('wireless');
  assert.equal(await product.getByLabel('适用法规', { exact: true }).inputValue(), '2014/53/EU (RED), 2011/65/EU (RoHS)');
  await product.getByRole('button', { name: '问题反馈 / 功能定制', exact: true }).click();
  const dialog = product.getByRole('dialog');
  assert.match(await dialog.innerText(), /1\.1\.0/);
  assert.equal(await dialog.evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)');
  await dialog.screenshot({ path: path.join(output, 'upgrade-feedback.png'), animations: 'disabled' });
  await product.getByRole('button', { name: '关闭反馈', exact: true }).press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await product.getByRole('dialog').count(), 0);
  assert.equal(await product.locator('.launcher').getAttribute('aria-expanded'), 'true', '关闭反馈不能同时关闭抽屉');
  await product.getByRole('button', { name: '商品透视', exact: true }).click();
  await product.getByLabel('VAT 参考站点', { exact: true }).selectOption('HU');
  assert.equal(await product.getByLabel('VAT 税率', { exact: true }).inputValue(), '27');
  await product.getByLabel('VAT 税率', { exact: true }).fill('5');
  await product.getByLabel('VAT 税率', { exact: true }).press('Enter');
  await product.getByLabel('履约模式', { exact: true }).selectOption('fbe');
  assert.equal(await product.getByLabel('FBE / 当地费用', { exact: true }).inputValue(), '15');
  await product.getByLabel('平台佣金率', { exact: true }).fill('13');
  await product.getByLabel('平台佣金率', { exact: true }).press('Enter');
  await product.getByRole('checkbox', { name: '计入小额订单 2% 附加费', exact: true }).check();
  await product.getByText('查看计算口径', { exact: true }).click();
  await product.getByRole('button', { name: '最低报价: 119.90 RON · 点击填入', exact: true }).click();
  await product.locator('.profit-result.high').waitFor();
  const expectedProfit = (119.9 / 1.05 - 119.9 * 0.15 - 15) * 1.58 * 0.985 - 30 - 12;
  assert.equal(await product.locator('.result-value').innerText(), `${expectedProfit.toFixed(2)} RMB`);
  await product.locator('.drawer.open').screenshot({ path: path.join(output, 'upgrade-profit.png'), animations: 'disabled' });
  await product.evaluate(() => { history.pushState({}, '', '/search/test'); });
  await product.locator('#emag-seller-toolkit-root').waitFor({ state: 'detached' });
  assert.deepEqual(failures, [], '页面出现未处理异常');
  console.log('浏览器冒烟通过（本地夹具）：扩展加载、权限、高清主图及懒加载、AVIF 转 JPEG、DIV/扩展名上传控件、自动搜索、超时下载回退、共享表单、PDF下载、超容拦截、Shadow DOM 隔离、利润计算、焦点恢复及商品页离开。');
} finally { await context.close(); }
