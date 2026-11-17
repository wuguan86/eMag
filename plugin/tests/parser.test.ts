import { describe, expect, it } from 'vitest';
import { isProductUrl, parseProduct } from '../src/utils/productParser';
import { parseRonPrice } from '../src/utils/price';

const currentUrl = 'https://www.emag.ro/produs-curent/pd/ABC123/';
function parseMarkup(markup: string) {
  return parseProduct(new DOMParser().parseFromString(markup, 'text/html'), currentUrl);
}
function structured(data: unknown) {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

describe('RON 价格', () => {
  it.each([
    ['1.234,56 Lei', 1234.56], ['1 234,56 RON', 1234.56], ['1\u00a0234,56 lei', 1234.56],
    ['1234.56', 1234.56], ['1,234.56', 1234.56], ['1.234', 1234], ['99,99', 99.99], ['0 Lei', 0],
  ])('解析 %s', (text, amount) => expect(parseRonPrice(text)).toBe(amount));
  it.each(['', 'N/A', '-12 Lei', 'Infinity', '100 Lei 90 Lei', '12abc', '1.2.3', '10 99'])('拒绝不合法价格 %s', (text) => {
    expect(parseRonPrice(text)).toBeNull();
  });
});

describe('当前商品解析', () => {
  it('只接受 eMAG 商品页地址', () => {
    expect(isProductUrl(currentUrl)).toBe(true);
    expect(isProductUrl('https://www.emag.ro/search/pd/ABC123/')).toBe(false);
    expect(isProductUrl('https://evil.test/produs/pd/ABC123/')).toBe(false);
    expect(isProductUrl('https://www.emag.ro.evil.test/produs/pd/ABC123/')).toBe(false);
    expect(isProductUrl('javascript:alert(1)')).toBe(false);
  });

  it('读取当前商品 DOM、上标小数、销售方和其他报价数量', () => {
    const product = parseMarkup(`<h1 class="page-title"> Aspirator performant </h1>
      <div class="product-highlight"><p class="product-new-price">1.234<sup>56</sup> Lei</p></div>
      <div class="product-pictures-gallery"><img src="https://images.example/item.jpg"></div>
      <div class="product-seller">Vândut de <a class="seller-name">Magazin partener</a> și livrat de <a>eMAG</a></div>
      <a href="#other-offers">Alte 7 oferte</a>`);
    expect(product).toMatchObject({ productId: 'ABC123', title: 'Aspirator performant', priceRon: 1234.56,
      sellerName: 'Magazin partener', isEmagSeller: false, otherOfferCount: 7, imageUrl: 'https://images.example/item.jpg' });
    expect(product.missingFields).toEqual([]);
    expect(product.sources.priceRon).toContain('dom');
  });

  it('不会选择推荐区的价格、销售方和图片', () => {
    const product = parseMarkup(`<section class="recommendations"><h1 class="page-title">推荐品</h1>
      <p class="product-new-price">1 Lei</p><a class="seller-name">eMAG</a>
      <div class="product-pictures-gallery"><img src="https://images.example/wrong.jpg"></div></section>
      <h1 class="page-title">当前商品</h1><p class="product-new-price">199<sup>99</sup> Lei</p>`);
    expect(product.title).toBe('当前商品');
    expect(product.priceRon).toBe(199.99);
    expect(product.sellerName).toBeNull();
    expect(product.imageUrl).toBeNull();
  });

  it('只使用与当前 URL 匹配的 JSON-LD，数字价额有效', () => {
    const product = parseMarkup(structured({ '@graph': [
      { '@type': 'Product', url: 'https://www.emag.ro/vechi/pd/OLD123/', name: '旧商品', offers: { '@type': 'Offer', price: 1 } },
      { '@type': 'Product', url: currentUrl, name: '匹配商品', image: ['https://images.example/right.jpg'],
        offers: { '@type': 'Offer', price: 250.5, priceCurrency: 'RON', seller: { name: 'eMAG' } } },
    ] }));
    expect(product).toMatchObject({ title: '匹配商品', priceRon: 250.5, sellerName: 'eMAG', isEmagSeller: true });
    expect(product.sources.priceRon).toContain('jsonld');
  });

  it('当前 DOM 优先于陈旧结构化价格', () => {
    const product = parseMarkup(`<h1 class="page-title">现价</h1><div class="product-new-price">500<sup>99</sup> Lei</div>` +
      structured({ '@type': 'Product', url: currentUrl, name: '结构化标题', offers: { '@type': 'Offer', price: 50 } }));
    expect(product.title).toBe('现价');
    expect(product.priceRon).toBe(500.99);
  });

  it('忽略未确定商品身份、聚合最低价以及非 RON 结构化报价', () => {
    for (const data of [
      { '@type': 'Product', name: '身份未知', offers: { '@type': 'Offer', price: 1 } },
      { '@type': 'Product', url: currentUrl, offers: { '@type': 'AggregateOffer', lowPrice: 1, highPrice: 9 } },
      { '@type': 'Product', url: currentUrl, offers: { '@type': 'Offer', price: 1, priceCurrency: 'USD' } },
    ]) expect(parseMarkup(structured(data)).priceRon).toBeNull();
  });

  it('销售方严格识别官方名称，配送方不是销售方', () => {
    expect(parseMarkup('<div class="product-seller">Vândut de <a>eMAG Marketplace</a> și livrat de <a>eMAG</a></div>').isEmagSeller).toBe(false);
    expect(parseMarkup('<div class="product-seller">Livrat de <a>eMAG</a></div>').sellerName).toBeNull();
    expect(parseMarkup('<div class="product-seller">Vândut de <a> eMAG </a></div>').isEmagSeller).toBe(true);
  });

  it('兼容销售配送合并文案、无变音符号及冒号', () => {
    expect(parseMarkup('<div class="product-seller">Vândut și livrat de: <a>eMAG</a></div>').sellerName).toBe('eMAG');
    expect(parseMarkup('<div class="product-seller">Vandut de: <a>Partener</a> si livrat de: <a>eMAG</a></div>').sellerName).toBe('Partener');
  });

  it('从销售方组织的语义名称提取名称', () => {
    expect(parseMarkup('<div itemprop="seller" itemscope itemtype="https://schema.org/Organization"><meta itemprop="name" content="eMAG"><span itemprop="address">București</span></div>').sellerName).toBe('eMAG');
  });

  it('缺失报价数为 null，明确没有其他报价为 0', () => {
    expect(parseMarkup('<h1 class="page-title">商品</h1>').otherOfferCount).toBeNull();
    expect(parseMarkup('<div id="other-offers">Nu există alte oferte</div>').otherOfferCount).toBe(0);
    expect(parseMarkup('<a href="#other-offers">Alte oferte (12 oferte)</a>').otherOfferCount).toBe(12);
    expect(parseMarkup('<a href="#other-offers">Alte oferte (12)</a>').otherOfferCount).toBe(12);
  });

  it('拒绝脚本图片并在损坏 JSON-LD 时完整报告缺失字段', () => {
    const product = parseMarkup('<script type="application/ld+json">{broken</script><div class="product-pictures-gallery"><img src="javascript:alert(1)"></div>');
    expect(product.imageUrl).toBeNull();
    expect(product.missingFields).toEqual(['title', 'imageUrl', 'priceRon', 'sellerName', 'otherOfferCount']);
    expect(product.sources).toEqual({});
  });

  it('忽略配送方节点上复用的卖家类名', () => {
    expect(parseMarkup('<div class="product-seller">Livrat de <a class="seller-name">eMAG</a></div>').sellerName).toBeNull();
  });

  it('忽略属于其他商品语义容器的价格', () => {
    const product = parseMarkup(`<section itemscope itemtype="https://schema.org/Product">
      <a itemprop="url" href="https://www.emag.ro/alt/pd/OTHER123/">其他商品</a>
      <meta itemprop="price" content="1"></section>`);
    expect(product.priceRon).toBeNull();
  });

  it('不把语义聚合报价中的最低价格当作当前售价', () => {
    const product = parseMarkup('<div itemscope itemtype="https://schema.org/AggregateOffer"><meta itemprop="price" content="1"></div>');
    expect(product.priceRon).toBeNull();
  });

  it('读取明确当前商品的语义属性及安全相对图片', () => {
    const product = parseMarkup(`<article itemscope itemtype="https://schema.org/Product">
      <meta itemprop="url" content="${currentUrl}"><h1 itemprop="name">语义商品</h1>
      <meta itemprop="price" content="999.50"><meta itemprop="image" content="/images/item.jpg">
      <span itemprop="seller">eMAG</span></article>`);
    expect(product).toMatchObject({ title: '语义商品', priceRon: 999.5, imageUrl: 'https://www.emag.ro/images/item.jpg', sellerName: 'eMAG' });
  });

  it('多个结构化报价只采用明确匹配当前商品的唯一报价', () => {
    const offers = [
      { '@type': 'Offer', url: 'https://www.emag.ro/alt/pd/OTHER123/', price: 1 },
      { '@type': 'Offer', url: currentUrl, price: 999 },
    ];
    expect(parseMarkup(structured({ '@type': 'Product', url: currentUrl, offers })).priceRon).toBe(999);
    expect(parseMarkup(structured({ '@type': 'Product', url: currentUrl, offers: [{ price: 1 }, { price: 2 }] })).priceRon).toBeNull();
  });

  it('已声明错误商品URL时不允许同名SKU覆盖身份判断', () => {
    expect(parseMarkup(structured({ '@type': 'Product', url: 'https://evil.test/item', sku: 'ABC123', offers: { price: 1 } })).priceRon).toBeNull();
  });

  it('图片懒加载属性不安全时继续尝试安全的src', () => {
    expect(parseMarkup('<div class="product-pictures-gallery"><img data-src="data:text/plain,wrong" src="https://images.example/fallback.jpg"></div>').imageUrl).toBe('https://images.example/fallback.jpg');
  });

  it('其他报价区域的价格和卖家不能充当购买框信息', () => {
    const markup = '<div id="other-offers"><p class="product-new-price">10 Lei</p><span class="seller-name">其他商户</span></div>';
    expect(parseMarkup(markup + '<p class="product-new-price">500 Lei</p><span class="seller-name">当前商户</span>')).toMatchObject({ priceRon: 500, sellerName: '当前商户' });
    expect(parseMarkup(markup).priceRon).toBeNull();
  });

  it('通用容器中的配送方语义标记不能被误判成销售方', () => {
    expect(parseMarkup('<div>Livrat de <span itemprop="seller">eMAG</span></div>').sellerName).toBeNull();
  });

  it('独立配送说明不应抹掉明确的销售方语义', () => {
    expect(parseMarkup('<article><span itemprop="seller">eMAG</span><p>Livrat de Fan Courier</p></article>').sellerName).toBe('eMAG');
    expect(parseMarkup('<article><span itemprop="seller" itemscope><meta itemprop="name" content="eMAG"></span><p>Livrat de Fan Courier</p></article>').sellerName).toBe('eMAG');
  });

  it('不读取隐藏节点中的旧售价', () => {
    expect(parseMarkup('<p class="product-new-price" hidden>50 Lei</p><p class="product-new-price">500 Lei</p>').priceRon).toBe(500);
  });

  it('不同价额的结构化报价不能补齐当前购买框的销售方', () => {
    const product = parseMarkup('<p class="product-new-price">500 Lei</p>' + structured({ '@type': 'Product', url: currentUrl,
      offers: { '@type': 'Offer', price: 50, seller: { name: 'eMAG' } } }));
    expect(product.priceRon).toBe(500);
    expect(product.sellerName).toBeNull();
  });
});
