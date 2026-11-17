import type { ProductDataField, ProductField, ProductSnapshot } from '../types';
import { parseElementPrice } from './price';
import { readProductMetadata } from './productMetadata';
import { resolveProductImage } from './productImage';
import { readPageOtherOfferCount } from './pageState';
import { findProductNodes, productSelectors } from './selectors';
import { currentStructuredOffer, findStructuredProduct, productIdFromUrl, structuredImage, structuredPrice, structuredSeller } from './structuredProduct';

export function isProductUrl(url: string): boolean {
  return productIdFromUrl(url) !== null;
}

function cleanText(value: string | null | undefined): string | null {
  return value?.replace(/\s+/g, ' ').trim() || null;
}

function domSeller(element: Element): string | null {
  const parent = element.parentElement;
  const preceding = parent ? [...parent.childNodes].slice(0, [...parent.childNodes].indexOf(element)).map((node) => node.textContent ?? '').join(' ') : '';
  const hasLeadingSellerContext = /(?:v[âa]ndut(?:[ăa])?|livrat)[^.!?]{0,60}\sde\s*:?\s*$/i.test(preceding.trim());
  const context = element.closest('.product-seller, .seller-info')
    ?? (hasLeadingSellerContext && parent && !parent.matches('body, html') && (parent.textContent?.length ?? 0) < 500 ? parent : element);
  const text = cleanText(context.textContent);
  const explicit = element.getAttribute('data-seller-name');
  if (explicit) return cleanText(explicit);
  // 配送方可能同样是 eMAG；只截取罗马尼亚语“销售方”之后、配送说明之前的名称。
  const soldBy = /v[âa]ndut(?:[ăa])?\s+(?:[șs]i\s+livrat\s+)?de\s*:?\s*(.+?)(?=\s+(?:[șs]i\s+)?livrat|$)/i.exec(text ?? '');
  if (soldBy) return cleanText(soldBy[1]);
  if (/livrat/i.test(text ?? '')) return null;
  if (element.matches('[itemprop="seller"]')) {
    const name = element.querySelector('[itemprop="name"]');
    if (name) return cleanText(name.getAttribute('content') ?? name.textContent);
  }
  if (!text) return null;
  if (element.matches('.seller-name, [itemprop="seller"]')) return cleanText(element.textContent);
  return null;
}

function domOfferCount(element: Element): number | null {
  const text = cleanText(element.textContent)?.normalize('NFD').replace(/[\u0300-\u036f]/g, '') ?? '';
  if (/nu\s+(?:exista|sunt)\s+alte\s+oferte|fara\s+alte\s+oferte/i.test(text)) return 0;
  const count = /(?:alte\s+)(\d+)\s+oferte/i.exec(text)?.[1] ?? /\b(\d+)\s+(?:alte\s+)?oferte/i.exec(text)?.[1]
    ?? /alte\s+oferte\s*\(\s*(\d+)\s*\)/i.exec(text)?.[1];
  if (!count) return null;
  const value = Number(count);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function parseProduct(document: Document, url: string): ProductSnapshot {
  const product: ProductSnapshot = { productId: productIdFromUrl(url) ?? '', url,
    title: null, imageUrl: null, priceRon: null, sellerName: null, isEmagSeller: null,
    otherOfferCount: null, brandName: null, breadcrumbs: null, lowestOtherOfferRon: null,
    sources: {}, missingFields: [], capturedAt: Date.now() };
  const setField = <Field extends ProductDataField>(field: Field, value: ProductSnapshot[Field], source: string) => {
    if (product[field] === null && value !== null) {
      product[field] = value;
      product.sources[field] = source;
    }
  };

  for (const node of findProductNodes(document, productSelectors.title, url)) {
    setField('title', cleanText(node.textContent), 'dom:title');
  }
  for (const node of findProductNodes(document, productSelectors.price, url)) {
    setField('priceRon', parseElementPrice(node), 'dom:price');
  }
  for (const node of findProductNodes(document, productSelectors.seller, url)) {
    setField('sellerName', domSeller(node), 'dom:seller');
  }
  for (const node of findProductNodes(document, productSelectors.offers, url, true)) {
    setField('otherOfferCount', domOfferCount(node), 'dom:other-offers');
  }
  setField('otherOfferCount', readPageOtherOfferCount(document, url), 'page-data:other-offers');
  const metadata = readProductMetadata(document, url);
  setField('brandName', metadata.brandName, 'dom:brand');
  setField('breadcrumbs', metadata.breadcrumbs, 'dom:breadcrumbs');
  setField('lowestOtherOfferRon', metadata.lowestOtherOfferRon, 'dom:other-offers-price');

  const structured = findStructuredProduct(document, url);
  const image = resolveProductImage(document, url, structured ? structuredImage(structured) : null);
  if (image) setField('imageUrl', image.url, image.source);
  if (structured) {
    const brand = structured.brand;
    const brandName = typeof brand === 'string' ? brand : brand && typeof brand === 'object' && 'name' in brand && typeof brand.name === 'string' ? brand.name : null;
    setField('brandName', cleanText(brandName), 'jsonld:brand');
    const offer = currentStructuredOffer(structured, url);
    setField('title', typeof structured.name === 'string' ? cleanText(structured.name) : null, 'jsonld:name');
    const offerPrice = structuredPrice(offer);
    const offerSeller = structuredSeller(offer);
    // 结构化报价必须与已读取的购买框一致，避免拼接现价与旧销售方。
    const consistent = (product.priceRon === null || product.priceRon === offerPrice)
      && (product.sellerName === null || product.sellerName === offerSeller);
    if (consistent) {
      setField('priceRon', offerPrice, 'jsonld:offers.price');
      setField('sellerName', offerSeller, 'jsonld:offers.seller');
    }
  }
  product.isEmagSeller = product.sellerName === null ? null : /^emag$/i.test(product.sellerName.trim());
  const fields: ProductField[] = ['title', 'imageUrl', 'priceRon', 'sellerName', 'otherOfferCount'];
  product.missingFields = fields.filter((field) => product[field] === null);
  return product;
}
