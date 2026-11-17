import type { ProductDataField, ProductField, ProductSnapshot } from '../types';
import { findProductNodes, productSelectors } from '../utils/selectors';
import { metadataNodes } from '../utils/productMetadata';

const requiredFields: ProductField[] = ['title', 'imageUrl', 'priceRon', 'sellerName', 'otherOfferCount'];
const fields: ProductDataField[] = [...requiredFields, 'brandName', 'breadcrumbs', 'lowestOtherOfferRon'];
const selectorNames = { title: 'title', imageUrl: 'image', priceRon: 'price', sellerName: 'seller', otherOfferCount: 'offers' } as const;
interface Evidence { value: unknown; nodes: Node[] }

function captureEvidence(document: Document, product: ProductSnapshot, field: ProductDataField): Evidence {
  const elements = field === 'brandName' || field === 'breadcrumbs' || field === 'lowestOtherOfferRon'
    ? metadataNodes(document, product.url, field)
    : findProductNodes(document, productSelectors[selectorNames[field]], product.url, field === 'otherOfferCount', field === 'imageUrl').slice(0, 1);
  const descend = (node: Node): Node[] => [node, ...[...node.childNodes].flatMap(descend)];
  // 面包屑是数组，每次解析都会创建新数组；比较内容签名才能识别未更新的旧节点。
  return { value: field === 'breadcrumbs' && product[field] ? JSON.stringify(product[field]) : product[field], nodes: elements.flatMap(descend) };
}

export class ProductFreshness {
  private previous: { id: string; evidence: Map<ProductDataField, Evidence> } | null = null;
  private pending = new Map<ProductDataField, Evidence>();

  reset() { this.previous = null; this.pending.clear(); }

  accept(product: ProductSnapshot, document: Document): ProductSnapshot {
    const evidence = new Map(fields.map((field) => [field, captureEvidence(document, product, field)]));
    if (this.previous && this.previous.id !== product.productId) {
      this.pending = new Map([...this.previous.evidence].filter(([, item]) => item.value !== null));
    }
    this.previous = { id: product.productId, evidence };
    const result = { ...product, sources: { ...product.sources } };
    for (const [field, previous] of this.pending) {
      const current = evidence.get(field)!;
      const sameNodes = current.nodes.length === previous.nodes.length && current.nodes.every((node, index) => node === previous.nodes[index]);
      // 相同字段值且原节点未替换时无法确认属于新商品；逐字段等待更新，避免新标题配旧价格。
      const identified = /^(jsonld:|page-data:)/.test(product.sources[field] ?? '');
      const stale = current.value === null || (current.value === previous.value && sameNodes && !identified);
      if (stale) { Object.assign(result, { [field]: null }); delete result.sources[field]; }
      else this.pending.delete(field);
    }
    result.missingFields = requiredFields.filter((field) => result[field] === null);
    result.isEmagSeller = result.sellerName === null ? null : product.isEmagSeller;
    return result;
  }
}
