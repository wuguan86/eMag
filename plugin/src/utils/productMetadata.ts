import type { ProductMetadataField } from '../types';
import { parseElementPrice, parseRonPrice } from './price';
import { findProductNodes, isCurrentProductNode, productSelectors } from './selectors';
import { productIdFromUrl } from './structuredProduct';

export const normalizeReference = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() || null;
const genericBrandLink = /^(?:vezi toate produsele|vezi produse|toate produsele|brand|marca)$/i;

// URL可先于DOM变化：仅实际提供字段值的节点参与证据，库存等无关变化不能放行旧字段。
export function metadataNodes(document: Document, url: string, field: ProductMetadataField): Node[] {
  return readProductMetadata(document, url).evidence[field];
}

function brandSource(node: Element): { node: Element; value: string } | null {
  let candidates: Element[];
  if (node.matches('tr')) {
    const cells = [...node.querySelectorAll('th,td')];
    if (!/^(?:brand|marca)$/.test(normalizeReference(cells[0]?.textContent ?? ''))) return null;
    candidates = cells[1] ? [cells[1]] : [];
  } else {
    candidates = [
      ...(node.hasAttribute('data-brand-name') && clean(node.getAttribute('data-brand-name')) ? [node] : []),
      ...node.querySelectorAll('[itemprop="name"]'), ...node.querySelectorAll('img[alt]'), node,
    ];
  }
  for (const source of candidates) {
    if (!isCurrentProductNode(source)) continue;
    const value = clean(source.getAttribute('data-brand-name')) ?? clean(source.getAttribute('content'))
      ?? clean(source.getAttribute('alt')) ?? clean(source.textContent);
    if (value && !genericBrandLink.test(value)) return { node: source, value };
  }
  return null;
}

function isCurrentOfferLink(node: Element, url: string) {
  if (!node.matches('a[href]')) return true;
  try {
    const target = new URL(node.getAttribute('href')!, url);
    const current = new URL(url);
    return target.origin === current.origin && target.pathname === current.pathname
      || target.origin === current.origin && productIdFromUrl(target.href)?.toUpperCase() === productIdFromUrl(url)?.toUpperCase();
  } catch { return false; }
}

const excludedOfferText = 'del, s, [hidden], [aria-hidden="true"], [class*="old-price"], [class*="installment"], [class*="monthly-payment"], [data-installment]';

function offerLinkMinimum(root: Element) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const segments: { node: Node; start: number; end: number }[] = [];
  let text = '';
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement || !isCurrentProductNode(node.parentElement) || node.parentElement.closest(excludedOfferText)) continue;
    const start = text.length;
    text += node.textContent ?? '';
    segments.push({ node, start, end: text.length });
  }
  const match = /\bde la\s+(\d[\d.,\s]*?)\s*(?:lei|ron)\b/i.exec(text);
  const value = match ? parseRonPrice(match[1]) : null;
  if (!match || value === null || value <= 0) return null;
  // 仅提供价格短语的原文本节点构成换品证据，不包括同一链接中的库存和其他装饰节点。
  const nodes = segments.filter((part) => part.end > match.index && part.start < match.index + match[0].length).map((part) => part.node);
  return { value, nodes };
}

export function readProductMetadata(document: Document, url: string) {
  const evidence: Record<ProductMetadataField, Node[]> = { brandName: [], breadcrumbs: [], lowestOtherOfferRon: [] };
  let brandName: string | null = null;
  for (const candidate of findProductNodes(document, productSelectors.brand, url)) {
    const source = brandSource(candidate);
    if (!source) continue;
    brandName = source.value; evidence.brandName = [source.node]; break;
  }
  let breadcrumbs: string[] | null = null;
  for (const root of findProductNodes(document, productSelectors.breadcrumbs, url)) {
    const items = [...root.querySelectorAll('li, [itemprop="itemListElement"]')].filter((item) =>
      !item.matches('.btn-product-page-back-to-category') && !item.querySelector('a[href*="back-breadcrumb"]'));
    const names = items.map((item) => item.querySelector('[itemprop="name"]') ?? item);
    const valid = names.map((node) => ({ node, value: clean(node.getAttribute('content') ?? node.textContent) }))
      .filter((item): item is { node: Element; value: string } => !!item.value && !/^(?:inapoi|back|home|acasa)$/.test(normalizeReference(item.value)));
    if (valid.length) { breadcrumbs = [...new Set(valid.map((item) => item.value))]; evidence.breadcrumbs = valid.map((item) => item.node); break; }
  }
  const prices: { value: number; nodes: Node[] }[] = [];
  const priceNodes = findProductNodes(document, productSelectors.price, url, true);
  for (const root of findProductNodes(document, productSelectors.offers, url, true).filter((node) => isCurrentOfferLink(node, url))) {
    const candidates = priceNodes.filter((node) => root.contains(node));
    for (const node of candidates) {
      const value = parseElementPrice(node);
      if (value !== null && value > 0) prices.push({ value, nodes: [node] });
    }
    // 入口上的“de la”是明确的其他报价最低价，不使用整页数字或聚合报价猜测。
    if (root.matches('a')) {
      const minimum = offerLinkMinimum(root);
      if (minimum) prices.push(minimum);
    }
  }
  const minimum = prices.sort((left, right) => left.value - right.value)[0];
  if (minimum) evidence.lowestOtherOfferRon = minimum.nodes;
  return { brandName, breadcrumbs, lowestOtherOfferRon: minimum?.value ?? null, evidence };
}
