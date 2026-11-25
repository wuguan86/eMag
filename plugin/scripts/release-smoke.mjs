import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { verifyReleaseArchive } from './release/archive.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(root, 'tmp/browsers');
const { chromium, expect } = await import('@playwright/test');
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const releaseDirectory = path.join(root, 'release');
const candidates = (await readdir(releaseDirectory))
  .filter((name) => name.startsWith('eMAG-seller-toolkit-' + metadata.version + '-') && name.endsWith('.zip')).sort();
const archivePath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2])
  : candidates.length ? path.join(releaseDirectory, candidates.at(-1)) : undefined;
assert.ok(archivePath, '请先运行 npm run package 生成当前版本发布包。');
const archive = new Uint8Array(await readFile(archivePath));
verifyReleaseArchive(archive, metadata.version);
const temporaryRoot = path.join(root, 'tmp');
await mkdir(temporaryRoot, { recursive: true });
const temporary = await mkdtemp(path.join(temporaryRoot, 'release-verification-'));
const resolvedTemporary = path.resolve(temporary);
assert.ok(resolvedTemporary.startsWith(path.resolve(temporaryRoot) + path.sep), '临时目录必须位于项目 tmp 内。');
const extensionPath = path.join(temporary, 'extension');
const output = path.join(root, 'test-results/release');
await mkdir(output, { recursive: true });
let context;
try {
  // 只加载实际 ZIP 解压出的文件，防止测试误用工作目录里较新的 dist。
  for (const [name, bytes] of Object.entries(unzipSync(archive))) {
    const destination = path.join(extensionPath, name);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  const failures = [];
  context = await chromium.launchPersistentContext(path.join(temporary, 'privacy-profile'), {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
    args: ['--disable-extensions-except=' + extensionPath, '--load-extension=' + extensionPath],
  });
  context.setDefaultTimeout(15_000);
  context.on('page', (page) => page.on('pageerror', (error) => failures.push(error.message)));
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionOrigin = 'chrome-extension://' + new URL(worker.url()).hostname;
  const popup = await context.newPage();
  await popup.goto(extensionOrigin + '/popup.html');
  await expect(popup.getByRole('button', { name: '隐私与数据', exact: true })).toBeVisible();
  assert.equal(await popup.evaluate(() => chrome.runtime.getManifest().version), metadata.version);
  const policyEvent = context.waitForEvent('page');
  await popup.getByRole('button', { name: '隐私与数据', exact: true }).click();
  const policy = await policyEvent;
  await policy.waitForURL(extensionOrigin + '/privacy.html');
  await expect(policy.getByRole('heading', { name: '隐私与数据说明', exact: true })).toBeVisible();
  await expect(policy.locator('body')).toContainText('模型服务商');
  // 扩展协议使用浏览器自身加载，同时验证许可文件可由用户实际打开。
  const noticePage = await context.newPage();
  await noticePage.goto(extensionOrigin + '/THIRD_PARTY_NOTICES.txt');
  await expect(noticePage.locator('body')).toContainText('The Noto Project Authors');
  await expect(noticePage.locator('body')).toContainText('Johan Lindell');
  await policy.setViewportSize({ width: 432, height: 700 });
  assert.equal(await policy.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, '隐私说明在窄窗口应完整显示');
  await policy.screenshot({ path: path.join(output, 'privacy.png'), fullPage: true });

  await context.route('https://www.emag.ro/**', (route) => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><h1 class="page-title">上架校验商品</h1>'
      + '<div class="product-highlight"><p class="product-new-price">129<sup>99</sup> Lei</p></div>'
      + '<div class="product-seller">Vândut și livrat de eMAG</div>',
  }));
  const product = await context.newPage();
  await product.goto('https://www.emag.ro/fixture/pd/RELEASE123/');
  await product.getByRole('button', { name: '打开 eMAG 卖家工具箱' }).click();
  await expect(product.locator('.product-copy')).toContainText('上架校验商品');
  const productPolicyEvent = context.waitForEvent('page');
  await product.getByRole('button', { name: '隐私与数据', exact: true }).click();
  const productPolicy = await productPolicyEvent;
  await productPolicy.waitForURL(extensionOrigin + '/privacy.html');
  await expect(productPolicy.getByRole('heading', { name: '隐私与数据说明', exact: true })).toBeVisible();
  await product.getByRole('button', { name: '问题反馈 / 功能定制', exact: true }).click();
  await expect(product.getByRole('dialog')).toContainText('独立第三方');
  await product.getByRole('button', { name: '关闭反馈', exact: true }).click();
  await product.locator('.drawer').screenshot({ path: path.join(output, 'product.png') });
  assert.deepEqual(failures, [], '实际发布包不能出现浏览器运行错误');
  await context.close();
  context = undefined;

  // 复用当前表单的完整浏览器验证，覆盖本机保存、PDF、PNG 与商品页共享资料。
  execFileSync(process.execPath, [path.join(root, 'scripts/gpsr-layout-smoke.mjs')], {
    cwd: root, stdio: 'inherit', env: { ...process.env, EMAG_EXTENSION_PATH: extensionPath,
      EMAG_BROWSER_PROFILE: path.join(temporary, 'label-profile') },
  });
  execFileSync(process.execPath, [path.join(root, 'scripts/saved-page-smoke.mjs'), path.join(root, 'tests/fixtures/emag-columbia.html')], {
    cwd: root, stdio: 'inherit', env: { ...process.env, EMAG_EXTENSION_PATH: extensionPath,
      EMAG_BROWSER_PROFILE: path.join(temporary, 'product-profile') },
  });
  console.log('实际发布 ZIP 浏览器验证通过，版本 ' + metadata.version + '，覆盖双入口隐私说明、商品解析、本机保存、PDF、PNG、图片转换及图搜提交。');
} finally {
  await context?.close();
  await rm(resolvedTemporary, { recursive: true, force: true });
}
