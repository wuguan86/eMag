import { describe, expect, it } from 'vitest';
import { parseProduct } from '../src/utils/productParser';

const productUrl = 'https://www.emag.ro/produs/pd/ABC123/';
const imageRoot = 'https://s13emagst.akamaized.net/products/137847/137846884/images/res_product.jpg';
function parse(markup: string) { return parseProduct(new DOMParser().parseFromString(markup, 'text/html'), productUrl); }
function structured(image: string, url = productUrl) {
  return `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', url, image })}</script>`;
}

describe('商品高清主图选择', () => {
  it('缩略图排在前面时仍读取主图，并清除图片地址的重复实体转义', () => {
    const product = parse(`<div class="product-pictures-gallery"><img src="${imageRoot}?width=80&amp;amp;height=80&amp;amp;hash=thumb"></div>
      <img id="main-image" src="${imageRoot}?width=1000&amp;amp;height=1000&amp;amp;hash=large">`);
    expect(product.imageUrl).toBe(`${imageRoot}?width=1000&height=1000&hash=large`);
  });

  it('使用图片链接中的原图地址，保留签名和已有尺寸参数', () => {
    const product = parse(`<div id="product-gallery"><a href="${imageRoot}?width=1600&amp;height=1600&amp;hash=signed%2Bvalue"><img src="${imageRoot}?width=80&amp;height=80&amp;hash=thumb"></a></div>`);
    expect(product.imageUrl).toBe(`${imageRoot}?width=1600&height=1600&hash=signed%2Bvalue`);
  });

  it('选择 srcset 中实际存在的最大图片，不能自行改写签名尺寸', () => {
    const product = parse(`<div id="product-gallery"><img src="${imageRoot}?width=80" srcset="${imageRoot}?width=400 400w, ${imageRoot}?width=1200 1200w"></div>`);
    expect(product.imageUrl).toBe(`${imageRoot}?width=1200`);
  });

  it('相同商品结构化大图可以替代图库中的80像素缩略图', () => {
    const product = parse(`<div class="product-pictures-gallery"><img src="${imageRoot}?width=80"></div>` + structured(`${imageRoot}?width=1200&hash=valid`));
    expect(product.imageUrl).toBe(`${imageRoot}?width=1200&hash=valid`);
  });

  it('明确主图优先于其他角度的更大图片', () => {
    const product = parse(`<img id="main-image" src="${imageRoot}?width=640"><div class="product-pictures-gallery"><img src="https://images.example/back.jpg?width=2000"></div>`);
    expect(product.imageUrl).toBe(`${imageRoot}?width=640`);
  });

  it('可读取商品图库轮播中的主图，但不能读取推荐轮播的大图', () => {
    const product = parse(`<div class="recommendations"><div class="product-gallery"><div class="carousel"><img id="main-image" src="https://images.example/wrong.jpg?width=2000"></div></div></div>
      <div class="product-gallery"><div class="carousel"><img id="main-image" src="${imageRoot}?width=900"></div></div>`);
    expect(product.imageUrl).toBe(`${imageRoot}?width=900`);
  });

  it('优先读取缩放原图属性，并忽略危险的原图链接', () => {
    const product = parse(`<div id="product-gallery"><img data-zoom-image="${imageRoot}?width=1800&amp;height=1800" src="${imageRoot}?width=600"></div>`);
    expect(product.imageUrl).toBe(`${imageRoot}?width=1800&height=1800`);
    expect(parse('<div id="product-gallery"><img data-zoom-image="javascript:alert(1)" src="https://images.example/safe.jpg"></div>').imageUrl).toBe('https://images.example/safe.jpg');
  });

  it('Open Graph 大图只在 canonical 明确匹配当前商品时兜底', () => {
    const markup = '<meta property="og:image" content="https://images.example/social.jpg?width=1200">';
    expect(parse(`<link rel="canonical" href="${productUrl}">${markup}`).imageUrl).toBe('https://images.example/social.jpg?width=1200');
    expect(parse(`<link rel="canonical" href="https://www.emag.ro/old/pd/OLD123/">${markup}`).imageUrl).toBeNull();
  });

  it('其他商品结构化图片不能代替当前图库图片', () => {
    const product = parse(`<div id="product-gallery"><img src="${imageRoot}?width=600"></div>` + structured('https://images.example/wrong.jpg?width=2000', 'https://www.emag.ro/other/pd/OTHER123/'));
    expect(product.imageUrl).toBe(`${imageRoot}?width=600`);
  });
});
