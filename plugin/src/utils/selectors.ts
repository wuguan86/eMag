// 将站点选择器集中管理，页面结构变化时只需调整这一处。
export const productGallerySelector = '.product-pictures-gallery, #product-gallery, .product-gallery';
export const mainImageSelector = '#main-image, [data-main-image], [data-product-image], img[itemprop="image"], #product-gallery [data-ph-id="image-0"] img';

export const productSelectors = {
  title: ['h1.page-title', 'h1[itemprop="name"]', '[data-product-title]', 'h1'],
  price: ['.product-highlight .product-new-price', '.product-new-price', '[data-current-price]', '[itemprop="price"]'],
  image: [mainImageSelector, '.product-pictures-gallery img', '#product-gallery img', '.product-gallery img', '[itemprop="image"]'],
  seller: ['.product-seller', '.seller-info', '[data-seller-name]', '[itemprop="seller"]', '.seller-name'],
  offers: ['#other-offers', '[data-other-offers]', 'a[href*="other-offers"]', '.other-offers', '.product-other-offers'],
  brand: ['.product-brand-link', '[data-brand-name]', '[itemprop="brand"]', '.product-brand', '.specifications-table tr', '#specifications tr', 'table tr'],
  breadcrumbs: ['.section-breadcrumbs ol.breadcrumb', 'ol.breadcrumb', 'nav[aria-label*="breadcrumb" i]', '[itemtype$="/BreadcrumbList"]'],
} as const;

export function isCurrentProductNode(element: Element, allowProductGallery = false): boolean {
  // 推荐、相似商品和历史价格区共享价格类名，必须先排除这些祖先节点。
  const excluded = element.closest([
    '[class*="recommend"]', '[id*="recommend"]', '[class*="similar"]', '[id*="similar"]',
    '[class*="product-card"]', '[class*="card-item"]', '[data-product-card]',
    '[class*="old-price"]', '[class*="product-old-price"]', 'del', 's', '[aria-hidden="true"]', '[hidden]',
    '[itemtype$="/AggregateOffer"]',
    '[class*="installment"]', '[class*="monthly-payment"]', '[data-installment]',
  ].join(','));
  if (excluded) return false;
  // 仅图片解析可放行明确商品图库内部的轮播；价格等字段仍排除所有轮播。
  return !element.closest('[class*="carousel"]') || (allowProductGallery && !!element.closest(productGallerySelector));
}

export function findProductNodes(document: Document, selectors: readonly string[], url: string, includeOtherOffers = false, allowProductGallery = false): Element[] {
  return selectors.flatMap((selector) => [...document.querySelectorAll(selector)].filter((element) => {
    if (!isCurrentProductNode(element, allowProductGallery)) return false;
    if (!includeOtherOffers && element.closest('#other-offers, [data-other-offers], .other-offers, .product-other-offers')) return false;
    const scope = element.closest('[itemscope][itemtype$="/Product"]');
    const identity = scope?.querySelector('[itemprop="url"]');
    const identityUrl = scope?.getAttribute('itemid') ?? identity?.getAttribute('href') ?? identity?.getAttribute('content');
    if (!identityUrl) return true;
    try {
      return productIdFromUrl(new URL(identityUrl, url).href) === productIdFromUrl(url);
    } catch { return false; }
  }));
}
import { productIdFromUrl } from './structuredProduct';

