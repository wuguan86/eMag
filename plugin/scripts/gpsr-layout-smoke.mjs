import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('tmp/browsers');
const { chromium } = await import('@playwright/test');
const output = path.resolve('test-results/gpsr-layout');
await mkdir(output, { recursive: true });
const extensionPath = path.resolve('dist');
// 使用独立测试配置，避免读取或修改用户浏览器中的企业资料。
const context = await chromium.launchPersistentContext(path.resolve('tmp/gpsr-layout-profile'), {
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
const failures = [];
context.on('page', (page) => page.on('pageerror', (error) => failures.push(error.message)));
try {
  const manager = await context.newPage();
  await manager.goto('chrome://extensions/');
  const extension = manager.locator('extensions-item').filter({ hasText: 'eMAG 卖家工具箱' });
  await extension.waitFor();
  const extensionId = await extension.getAttribute('id');
  assert.ok(extensionId, '未加载待验证扩展');
  const manifest = JSON.parse(await readFile(path.join(extensionPath, 'manifest.json'), 'utf8'));
  assert.equal(manifest.side_panel.default_path, 'popup.html', '工具栏入口必须使用全高侧边栏页面');
  assert.equal(manifest.action.default_popup, undefined, '工具栏入口不能继续打开受限高度弹窗');
  const popup = await context.newPage();
  // 在无表单脚本的扩展页面写入夹具，防止初次草稿迁移覆盖测试资料。
  await popup.goto(`chrome-extension://${extensionId}/manifest.json`);
  await popup.evaluate(async () => {
    await chrome.storage.local.clear();
    const stored = (value) => ({ schemaVersion: 1, value });
    const euRep = { name: 'EU Safety SRL', address: 'Str. Unirii 1, Bucharest, Romania', email: 'safety@example.eu', phone: '+40 12345678' };
    const manufacturer = { name: 'Shenzhen Audio Co Ltd', address: 'Building 2, Shenzhen, China', email: 'factory@example.cn', phone: '' };
    const values = {
      'emag:v1:gpsrLabel.draft': stored({
        productName: { zh: '蓝牙耳机', ro: 'Căști Bluetooth', bg: 'Bluetooth слушалки', hu: 'Bluetooth fülhallgató' },
        material: 'plastic', model: 'B003', productSize: '42 cm', batch: 'LOT-20261117', ean13: '5901234123457', manualUrl: 'https://example.com/manual.pdf',
        labelSize: '70x80', customWidth: 70, customHeight: 80, orientation: 0, icons: ['ce', 'age'], warningId: 'choking',
      }),
    };
    for (const [role, company] of Object.entries({ euRep, manufacturer })) {
      for (const [key, value] of Object.entries(company)) values[`emag:v1:profile.${role}.${key}`] = stored(value);
      values[`emag:v1:templates.${role}`] = stored({
        templates: [{ id: role, name: '常用企业', company }], selectedId: role, defaultId: role,
      });
    }
    await chrome.storage.local.set(values);
  });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole('button', { name: '一键下载热敏打印 PDF' }).waitFor();
  assert.equal(await popup.getByRole('button', { name: 'DoC 草稿', exact: true }).count(), 0, '独立侧栏应隐藏 DoC 草稿页签');
  const barcodeInput = popup.getByLabel('EAN / UPC 商品码');
  await barcodeInput.fill('753758108612');
  await popup.getByLabel('Code 128 条码预览').locator('g rect').first().waitFor();
  await popup.waitForFunction(async () => (await chrome.storage.local.get('emag:v1:gpsrLabel.draft'))['emag:v1:gpsrLabel.draft']?.value.ean13 === '753758108612');
  await popup.reload();
  await popup.getByLabel('Code 128 条码预览').locator('g rect').first().waitFor();
  assert.equal(await barcodeInput.inputValue(), '753758108612', '重载后应保留完整商品码');
  const popupDimensions = await popup.evaluate(() => ({ viewport: window.innerHeight, body: document.body.getBoundingClientRect().height }));
  assert.equal(popupDimensions.body, popupDimensions.viewport, '右上角插件入口应与展开侧栏同高');
  await popup.waitForFunction(() => !document.querySelector('.gpsr-export-bar button').disabled).catch(async (error) => {
    console.error('标签状态诊断：', await popup.locator('.preview-errors').allTextContents(),
      await popup.getByLabel('罗马尼亚语 · RO').inputValue(), await popup.getByLabel('产品编号').inputValue());
    throw error;
  });
  const companySections = popup.locator('#gpsr-eu-rep, #gpsr-manufacturer');
  assert.equal(await companySections.getByRole('textbox', { name: 'Company Name' }).count(), 0, '收起时不应暴露企业输入框');
  const collapsedHeight = await popup.locator('.gpsr-label-content').evaluate((element) => element.scrollHeight);
  for (const section of await companySections.all()) {
    await section.getByRole('button', { name: '编辑详情' }).click();
    await section.locator('summary').click();
  }
  const expandedHeight = await popup.locator('.gpsr-label-content').evaluate((element) => element.scrollHeight);
  assert.ok(expandedHeight - collapsedHeight > 700, '企业折叠应显著减少滚动高度');
  for (const section of await companySections.all()) {
    await section.getByRole('button', { name: '收起编辑' }).click();
    await section.locator('summary').click();
  }
  const rep = popup.locator('#gpsr-eu-rep');
  await rep.getByRole('button', { name: '编辑详情' }).click();
  await rep.getByLabel('Company Name', { exact: true }).fill('Temporary Company');
  await rep.locator('summary').click();
  await rep.getByRole('button', { name: '应用所选模板' }).click();
  assert.equal(await rep.getByLabel('Company Name', { exact: true }).inputValue(), 'EU Safety SRL', '重复应用模板应恢复草稿');
  await rep.getByRole('button', { name: '收起编辑' }).click();
  await rep.locator('summary').click();
  await popup.setViewportSize({ width: 432, height: 600 });
  assert.equal(await popup.locator('body').evaluate((element) => element.getBoundingClientRect().height), 600, '窄窗口插件入口应随可用高度变化');
  await popup.getByRole('navigation', { name: 'GPSR 标签分区' }).getByRole('button', { name: '标签设置' }).click();
  const settings = popup.locator('#gpsr-settings');
  assert.equal(await settings.getByRole('group', { name: '出纸方向' }).count(), 0, '标签设置应移除出纸方向选项');
  const settingsBox = await settings.boundingBox();
  const sizeBox = await settings.getByLabel('打印尺寸').boundingBox();
  assert.ok(sizeBox.width > settingsBox.width * 0.8, '打印尺寸应占满可用行宽');
  await popup.screenshot({ path: path.join(output, 'popup-settings.png') });
  const downloadEvent = popup.waitForEvent('download');
  await popup.getByRole('button', { name: '一键下载热敏打印 PDF' }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), '753758108612.pdf', 'PDF 文件名应使用完整商品码');
  const pdfPath = path.join(output, 'label.pdf');
  await download.saveAs(pdfPath);
  assert.equal((await readFile(pdfPath)).subarray(0, 5).toString(), '%PDF-', '导出必须仍生成有效 PDF');
  assert.equal(await popup.getByText('PDF 已生成并发起下载。', { exact: true }).count(), 1, '导出消息只应显示一次');
  const imageDownloadEvent = popup.waitForEvent('download');
  await popup.getByRole('button', { name: '下载 PNG 图片' }).click();
  const imageDownload = await imageDownloadEvent;
  assert.equal(imageDownload.suggestedFilename(), '753758108612.png', '图片文件名应使用完整商品码');
  await imageDownload.saveAs(path.join(output, 'label.png'));
  const png = await readFile(path.join(output, 'label.png'));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', '图片下载必须生成有效 PNG');
  assert.equal(png.readUInt32BE(16), 827, '70 mm 标签应按高清分辨率生成图片');
  assert.equal(png.readUInt32BE(20), 945, '80 mm 标签应按高清分辨率生成图片');
  assert.equal(await popup.getByText('PNG 图片 已生成并发起下载。', { exact: true }).count(), 1, '图片下载应显示完成状态');
  for (const code of ['0590123412348', '']) {
    await barcodeInput.fill(code);
    await popup.waitForFunction((barcode) => {
      const preview = document.querySelector('#gpsr-preview .gpsr-preview-paper svg');
      const texts = [...(preview?.querySelectorAll('text') ?? [])].map((text) => text.textContent);
      const barcodeReady = barcode ? texts.includes(barcode) : !texts.some((text) => /^[0-9]{12,13}$/.test(text));
      return preview && barcodeReady && !document.querySelector('.gpsr-export-bar button').disabled;
    }, code);
    for (const format of ['pdf', 'png']) {
      const nextDownload = popup.waitForEvent('download');
      await popup.getByRole('button', { name: format === 'pdf' ? '一键下载热敏打印 PDF' : '下载 PNG 图片' }).click();
      const file = await nextDownload;
      assert.equal(file.suggestedFilename(), `${code || 'gpsr-product-label'}.${format}`, '两种格式应保留前导零并兼容空商品码');
      await file.saveAs(path.join(output, file.suggestedFilename()));
    }
  }
  await barcodeInput.fill('753758108612');
  await popup.waitForFunction(async () => (await chrome.storage.local.get('emag:v1:gpsrLabel.draft'))['emag:v1:gpsrLabel.draft']?.value.ean13 === '753758108612');

  await context.route('https://www.emag.ro/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><style>body{height:3000px}</style><h1 class="page-title">测试商品</h1>' }));
  const product = await context.newPage();
  await product.goto('https://www.emag.ro/fixture/pd/ABC123/');
  await product.getByRole('button', { name: '打开 eMAG 卖家工具箱' }).click();
  await product.locator('.drawer.open').waitFor();
  assert.equal(await product.getByRole('button', { name: 'DoC 草稿', exact: true }).count(), 0, '商品页侧栏应隐藏 DoC 草稿页签');
  assert.equal((await product.locator('.drawer').boundingBox()).width, 432, '商品页抽屉宽度应为432px');
  await product.getByRole('button', { name: 'GPSR 标签', exact: true }).click();
  await product.getByRole('button', { name: '一键下载热敏打印 PDF' }).waitFor({ state: 'visible' });
  await product.waitForFunction(() => !document.querySelector('#emag-seller-toolkit-root').shadowRoot.querySelector('.gpsr-export-bar button').disabled);
  const navigation = product.getByRole('navigation', { name: 'GPSR 标签分区' });
  await navigation.getByRole('button', { name: 'EU REP' }).click();
  assert.equal(await product.evaluate(() => location.hash), '', '分区跳转不能修改商品页面 URL');
  assert.equal(await product.evaluate(() => window.scrollY), 0, '分区跳转不能滚动宿主页面');
  const navBottom = (await navigation.boundingBox()).y + (await navigation.boundingBox()).height;
  assert.ok((await product.locator('#gpsr-eu-rep').boundingBox()).y >= navBottom - 1, '分区标题不能被导航遮挡');
  await product.locator('.drawer').screenshot({ path: path.join(output, 'drawer-companies.png') });
  await navigation.getByRole('button', { name: '预览', exact: true }).click();
  const contentBox = await product.locator('.gpsr-label-content').boundingBox();
  const exportBox = await product.locator('.gpsr-export-bar').boundingBox();
  assert.ok(contentBox.y + contentBox.height <= exportBox.y + 1, '下载栏不能覆盖表单滚动区域');
  await product.locator('#gpsr-preview .helper').scrollIntoViewIfNeeded();
  assert.ok(await product.locator('#gpsr-preview .helper').isVisible(), '预览底部说明必须可完整滚动到');
  await product.locator('.drawer').screenshot({ path: path.join(output, 'drawer-preview.png') });
  const drawerImageEvent = product.waitForEvent('download');
  await product.getByRole('button', { name: '下载 PNG 图片' }).click();
  const drawerImage = await drawerImageEvent;
  assert.equal(drawerImage.suggestedFilename(), '753758108612.png', '商品页侧栏图片下载也应按商品码命名');
  await drawerImage.saveAs(path.join(output, 'label-drawer.png'));
  assert.deepEqual(failures, [], '界面不能产生浏览器运行错误');
  const metrics = { collapsedHeight, expandedHeight, savedHeight: expandedHeight - collapsedHeight };
  await writeFile(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log('GPSR 窄侧栏、隐藏 DoC、商品码命名、PDF 与 PNG 下载验证通过。', metrics);
} finally {
  await context.close();
}
