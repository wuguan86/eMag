import type { ProductField, ProductSnapshot } from '../types';
import { isAwaitingProductContent } from '../utils/productStatus';

const labels: Record<ProductField, string> = { title: '标题', imageUrl: '主图', priceRon: '售价', sellerName: '销售方', otherOfferCount: '其他报价数' };

export class ProductParseReporter {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private currentKey = '';
  private reported = new Set<string>();

  reset() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.currentKey = '';
    this.reported.clear();
  }

  update(product: ProductSnapshot) {
    const key = `${product.productId}:${product.missingFields.join(',')}`;
    if (key === this.currentKey) return;
    clearTimeout(this.timer);
    this.currentKey = key;
    if (!product.missingFields.length || this.reported.has(key)) return;
    // 商品页加载、真人验证及页内换品都可能暂时没有节点；等字段状态稳定后才记录。
    this.timer = setTimeout(() => {
      this.reported.add(key);
      if (isAwaitingProductContent(product)) {
        console.info('尚未读取到商品内容，正在等待页面加载或验证完成；插件会自动重试。');
      } else {
        console.warn('商品解析不全，请核对页面字段：', product.missingFields.map((field) => labels[field]));
      }
    }, 2000);
  }
}
