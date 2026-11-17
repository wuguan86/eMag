import { describe, expect, it } from 'vitest';
import { parseProduct } from '../src/utils/productParser';
import { ProductFreshness } from '../src/content/productFreshness';
import capturedHtml from './fixtures/emag-columbia.html?raw';

const url = 'https://www.emag.ro/produs/pd/ABC123/';
function documentOf(html: string) { return new DOMParser().parseFromString(html, 'text/html'); }
function state(overrides: Record<string, unknown> = {}, identity = url) {
  const fields = { url: { path: new URL(identity).pathname }, pnk: 'ABC123', has_multiple_offers: false,
    offers_count: 1, multiple_offers_count: 0, ...overrides };
  return Object.entries(fields).map(([key, value]) => `EM.${key} = ${JSON.stringify(value)};`).join('\n');
}
function parse(script: string, markup = '') { return parseProduct(documentOf(`<script>${script}</script>${markup}`), url); }

describe('真实页面回归与身份匹配的报价数据', () => {
  it('真实商品页应读到其他报价为0，同时维持159.99售价及eMAG销售方', () => {
    const document = documentOf(capturedHtml);
    const canonical = document.querySelector('link[rel="canonical"]')!.getAttribute('href')!;
    const result = parseProduct(document, canonical);
    expect(result).toMatchObject({ priceRon: 159.99, sellerName: 'eMAG', isEmagSeller: true, otherOfferCount: 0 });
    expect(result.missingFields).toEqual([]);
  });

  it('真实图库原图不能被JSON-LD的80像素缩略图覆盖', () => {
    const document = documentOf(capturedHtml);
    const canonical = document.querySelector('link[rel="canonical"]')!.getAttribute('href')!;
    const mainImage = document.querySelector('#product-gallery [data-ph-id="image-0"] a')!.getAttribute('href');
    expect(parseProduct(document, canonical).imageUrl).toBe(mainImage);
  });

  it('明确的其他报价数与总报价数相互一致时可兜底', () => {
    expect(parse(state()).otherOfferCount).toBe(0);
    expect(parse(state({ offers_count: 4, multiple_offers_count: 3, has_multiple_offers: true })).otherOfferCount).toBe(3);
  });

  it.each([
    { pnk: 'OLD999' }, { pnk: { toString: 'invalid' } }, { url: { path: '/old/pd/OLD999/' } }, { url: null },
    { multiple_offers_count: -1 }, { multiple_offers_count: '0' },
    { multiple_offers_count: 0.5 }, { offers_count: 5 }, { has_multiple_offers: true },
  ])('不采纳身份缺失或相互矛盾的数据 %j', (overrides) => {
    expect(parse(state(overrides)).otherOfferCount).toBeNull();
  });

  it('只有总报价数时不能自行减一生成其他报价数', () => {
    expect(parse(state().replace(/^EM\.multiple_offers_count.*$/m, '')).otherOfferCount).toBeNull();
  });

  it('可见的其他报价数量优先于旧的页面脚本数据', () => {
    expect(parse(state(), '<div id="other-offers">Alte 2 oferte</div>').otherOfferCount).toBe(2);
  });

  it('不执行表达式、不读取注释或字符串中的伪数据', () => {
    expect(parse(`/*\n${state()}\n*/`).otherOfferCount).toBeNull();
    expect(parse(`const example = \`\n${state()}\n\`;`).otherOfferCount).toBeNull();
    expect(parse(state().replace('EM.multiple_offers_count = 0;', 'EM.multiple_offers_count = window.alert(0);')).otherOfferCount).toBeNull();
  });

  it('重复赋值和互相冲突的匹配脚本不能作为可靠证据', () => {
    expect(parse(state() + '\nEM.multiple_offers_count = 0;').otherOfferCount).toBeNull();
    const document = documentOf(`<script>${state()}</script><script>${state({ offers_count: 3, multiple_offers_count: 2, has_multiple_offers: true })}</script>`);
    expect(parseProduct(document, url).otherOfferCount).toBeNull();
  });

  it('页内切换不沿用旧商品计数，身份更新后相同计数仍可读取', () => {
    const document = documentOf(`<script>${state()}</script>`);
    const freshness = new ProductFreshness();
    expect(freshness.accept(parseProduct(document, url), document).otherOfferCount).toBe(0);
    const next = 'https://www.emag.ro/next/pd/NEW999/';
    expect(freshness.accept(parseProduct(document, next), document).otherOfferCount).toBeNull();
    document.querySelector('script')!.textContent = state({ pnk: 'NEW999' }, next);
    expect(freshness.accept(parseProduct(document, next), document).otherOfferCount).toBe(0);
  });
});
