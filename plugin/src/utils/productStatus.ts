import type { ProductSnapshot } from '../types';

export function isAwaitingProductContent(product: ProductSnapshot): boolean {
  return product.title === null && product.imageUrl === null && product.priceRon === null
    && product.sellerName === null && product.otherOfferCount === null;
}
