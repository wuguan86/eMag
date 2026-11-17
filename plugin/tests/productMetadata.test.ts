import { describe, expect, it } from 'vitest';
import { parseProduct } from '../src/utils/productParser';
import { ProductFreshness } from '../src/content/productFreshness';

const url = 'https://www.emag.ro/item/pd/ABC123/';
const documentOf = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('类目、品牌与其他报价', () => {
  it('使用品牌图片 alt，面包屑忽略返回入口', () => {
    const product = parseProduct(documentOf(`<ol class="breadcrumb"><li><a>Fashion</a></li><li><a>Încălțăminte bărbați</a></li><li><a>Ghete bărbați</a></li><li class="btn-product-page-back-to-category"><a>inapoi</a></li></ol>
      <a class="product-brand-link"><img alt="Columbia"><span>Vezi toate produsele</span></a>`), url);
    expect(product.brandName).toBe('Columbia');
    expect(product.breadcrumbs).toEqual(['Fashion', 'Încălțăminte bărbați', 'Ghete bărbați']);
    expect(product.sources.brandName).toBe('dom:brand');
    expect(product.missingFields).not.toContain('brandName');
  });

  it('仅取其他报价中的有效最低现价，不混入推荐、旧价或分期', () => {
    const product = parseProduct(documentOf(`<p class="product-new-price">200 Lei</p>
      <section id="other-offers">Alte 3 oferte
        <del class="product-new-price">5 Lei</del><div class="installments"><p class="product-new-price">9 Lei</p></div>
        <p class="product-new-price">129<sup>99</sup> Lei</p><p class="product-new-price">119,90 Lei</p>
        <div class="recommendations"><p class="product-new-price">1 Lei</p><span itemprop="brand">错误品牌</span></div>
      </section>`), url);
    expect(product.priceRon).toBe(200);
    expect(product.lowestOtherOfferRon).toBeCloseTo(119.90);
    expect(product.brandName).toBeNull();
  });

  it('兼容属性表品牌，只有入口没有价格时保持未知', () => {
    const product = parseProduct(documentOf('<table><tr><th>Brand</th><td>Fără brand</td></tr></table><a href="#other-offers">Alte 2 oferte</a>'), url);
    expect(product.brandName).toBe('Fără brand');
    expect(product.lowestOtherOfferRon).toBeNull();
  });

  it('仅以身份匹配的结构化品牌兜底，不采用聚合最低价', () => {
    const document = documentOf(`<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', url, brand: { name: 'OEM' }, offers: { '@type': 'AggregateOffer', lowPrice: 1 } })}</script>`);
    expect(parseProduct(document, url)).toMatchObject({ brandName: 'OEM', lowestOtherOfferRon: null, priceRon: null });
  });

  it('换品后不沿用旧品牌、面包屑及最低其他报价', () => {
    const document = documentOf('<h1>旧商品</h1><span itemprop="brand">OEM</span><ol class="breadcrumb"><li>Fashion</li></ol><div id="other-offers"><p class="product-new-price">50 Lei</p></div>');
    const freshness = new ProductFreshness();
    freshness.accept(parseProduct(document, url), document);
    const nextUrl = 'https://www.emag.ro/next/pd/NEXT123/';
    const next = freshness.accept(parseProduct(document, nextUrl), document);
    expect(next).toMatchObject({ brandName: null, breadcrumbs: null, lowestOtherOfferRon: null });
    document.querySelector('[itemprop="brand"]')!.outerHTML = '<span itemprop="brand">OEM</span>';
    expect(freshness.accept(parseProduct(document, nextUrl), document).brandName).toBe('OEM');
  });

  it('换品后更新无关表格或库存，不足以确认旧品牌和旧最低价属于新商品', () => {
    const document = documentOf('<table><tr><th>Brand</th><td>OEM</td></tr></table><div id="other-offers"><span class="stock">有货</span><p class="product-new-price">50 Lei</p></div>');
    const freshness = new ProductFreshness();
    freshness.accept(parseProduct(document, url), document);
    const nextUrl = 'https://www.emag.ro/next/pd/NEXT123/';
    freshness.accept(parseProduct(document, nextUrl), document);
    document.querySelector('table')!.insertAdjacentHTML('beforeend', '<tr><td>Weight</td><td>10</td></tr>');
    document.querySelector('.stock')!.textContent = '缺货';
    expect(freshness.accept(parseProduct(document, nextUrl), document)).toMatchObject({ brandName: null, lowestOtherOfferRon: null });
  });

  it('不读取其他商品的报价链接或链接内已删除的历史价格', () => {
    const document = documentOf('<a href="/foreign/pd/FOREIGN123/#other-offers">Alte oferte de la 5 Lei</a><a href="#other-offers">Alte oferte <del>de la 2 Lei</del></a>');
    expect(parseProduct(document, url).lowestOtherOfferRon).toBeNull();
  });

  it('入口最低价的证据不包含同一链接内的库存文字', () => {
    const document = documentOf('<a href="#other-offers">Alte 2 oferte de la 50 Lei <span class="stock">有货</span></a>');
    const freshness = new ProductFreshness();
    freshness.accept(parseProduct(document, url), document);
    const nextUrl = 'https://www.emag.ro/next/pd/NEXT123/';
    freshness.accept(parseProduct(document, nextUrl), document);
    document.querySelector('.stock')!.textContent = '缺货';
    expect(freshness.accept(parseProduct(document, nextUrl), document).lowestOtherOfferRon).toBeNull();
  });

  it('结构化面包屑读取meta的content属性', () => {
    const document = documentOf('<ol itemscope itemtype="https://schema.org/BreadcrumbList"><li itemprop="itemListElement"><meta itemprop="name" content="Telefoane mobile"></li></ol>');
    expect(parseProduct(document, url).breadcrumbs).toEqual(['Telefoane mobile']);
  });

  it.each([
    '<a class="product-brand-link" data-brand-name=""><img alt="Columbia"></a>',
    '<a class="product-brand-link"><span itemprop="name"></span><img alt="Columbia"></a>',
    '<a class="product-brand-link"><span itemprop="name" hidden>Generic</span><img alt="Columbia"></a>',
  ])('空属性或隐藏品牌不能阻断有效图片品牌 %s', (html) => {
    expect(parseProduct(documentOf(html), url).brandName).toBe('Columbia');
  });

  it('入口文本排除推荐区域的价格', () => {
    expect(parseProduct(documentOf('<a href="#other-offers"><span class="recommendations">de la 1 Lei</span> de la 100 Lei</a>'), url).lowestOtherOfferRon).toBe(100);
  });
});
