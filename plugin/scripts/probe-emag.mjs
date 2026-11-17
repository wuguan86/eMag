import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage();
try {
  const response = await page.goto('https://www.emag.ro/', { timeout: 25000, waitUntil: 'domcontentloaded' });
  console.log(JSON.stringify({
    status: response?.status(), title: await page.title(),
    text: (await page.locator('body').innerText()).slice(0, 350),
    links: await page.locator('a[href*="/pd/"]').evaluateAll((nodes) => nodes.slice(0, 2).map((node) => node.href)),
  }));
} catch (error) { console.log('站点验证未完成：', String(error)); }
finally { await browser.close(); }
