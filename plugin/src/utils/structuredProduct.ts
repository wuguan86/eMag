import { parseRonPrice } from './price';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasType(value: JsonRecord, name: string): boolean {
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  return types.some((type) => typeof type === 'string' && type.split('/').pop() === name);
}

export function productIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol) || !/^(?:www\.)?emag\.ro$/i.test(parsed.hostname)) return null;
    return /^\/(?!search\/)(?:[^/]+)\/pd\/([a-z\d]+)\/?$/i.exec(parsed.pathname)?.[1] ?? null;
  } catch { return null; }
}

function matchesProduct(value: JsonRecord, url: string): boolean {
  const currentId = productIdFromUrl(url);
  if (!currentId) return false;
  if (typeof value.url === 'string') {
    try {
      if (productIdFromUrl(new URL(value.url, url).href)?.toUpperCase() !== currentId.toUpperCase()) return false;
    } catch { return false; }
  }
  const identifiers = [value.url, value['@id'], value.mainEntityOfPage].flatMap((candidate) =>
    record(candidate) ? [candidate['@id'], candidate.url] : [candidate]);
  const urls = identifiers.filter((candidate): candidate is string => typeof candidate === 'string');
  const productUrls = urls.map((candidate) => {
    try { return productIdFromUrl(new URL(candidate, url).href); } catch { return null; }
  }).filter((candidate): candidate is string => candidate !== null);
  if (productUrls.length) return productUrls.every((id) => id.toUpperCase() === currentId.toUpperCase());
  return [value.sku, value.productID].some((identifier) =>
    typeof identifier === 'string' && identifier.toUpperCase() === currentId.toUpperCase());
}

function flatten(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (!record(value)) return [];
  return [value, ...flatten(value['@graph']), ...flatten(value.mainEntity)];
}

export function findStructuredProduct(document: Document, url: string): JsonRecord | null {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const products = flatten(JSON.parse(script.textContent ?? '') as unknown);
      const product = products.find((candidate) => hasType(candidate, 'Product') && matchesProduct(candidate, url));
      if (product) return product;
    } catch {
      // 不完整或失效的脚本不能阻断当前 DOM 的解析，缺失信息交由调用方提示。
    }
  }
  return null;
}

export function currentStructuredOffer(product: JsonRecord, url: string): JsonRecord | null {
  const offers = (Array.isArray(product.offers) ? product.offers : [product.offers]).filter(record)
    .filter((offer) => !hasType(offer, 'AggregateOffer'));
  const matching = offers.filter((offer) => typeof offer.url === 'string' && matchesProduct({ url: offer.url }, url));
  if (matching.length === 1) return matching[0];
  // 多报价无法确定购买框当前销售方时不猜测，也不采用聚合最低价。
  if (offers.length !== 1) return null;
  const offer = offers[0];
  return offer.url && !matchesProduct({ url: offer.url }, url) ? null : offer;
}

export function structuredPrice(offer: JsonRecord | null): number | null {
  if (!offer || (offer.priceCurrency && offer.priceCurrency !== 'RON')) return null;
  if (typeof offer.price === 'number') return Number.isFinite(offer.price) && offer.price >= 0 ? offer.price : null;
  return typeof offer.price === 'string' ? parseRonPrice(offer.price) : null;
}

export function structuredSeller(offer: JsonRecord | null): string | null {
  const seller = offer?.seller;
  if (typeof seller === 'string') return seller.trim() || null;
  return record(seller) && typeof seller.name === 'string' ? seller.name.trim() || null : null;
}

export function structuredImage(product: JsonRecord): unknown {
  const image = Array.isArray(product.image) ? product.image[0] : product.image;
  return record(image) ? image.url ?? image.contentUrl : image;
}
