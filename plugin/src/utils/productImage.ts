import { findProductNodes, mainImageSelector, productSelectors } from './selectors';
import { productIdFromUrl } from './structuredProduct';

interface ImageCandidate { url: string; source: string; priority: number; resolution: number; original: boolean }

function safeImageUrl(value: unknown, baseUrl: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  // 页面属性可能被多次实体转义；仅清理分隔符，不解码签名或重写 CDN 查询参数。
  let decoded = value.trim();
  for (let pass = 0; pass < 5; pass++) {
    const next = decoded.replace(/&(?:amp|#0*38|#x0*26);/gi, '&');
    if (next === decoded) break;
    decoded = next;
  }
  try {
    const parsed = new URL(decoded, baseUrl);
    return /^https?:$/.test(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : null;
  } catch { return null; }
}

function imageIdentity(url: string): string {
  const parsed = new URL(url);
  return parsed.origin + parsed.pathname;
}

function imageResolution(url: string, width: number): number {
  const query = new URL(url).searchParams;
  const dimensions = ['width', 'height', 'w', 'h'].map((key) => Number(query.get(key))).filter((value) => Number.isFinite(value) && value > 0);
  return Math.max(0, width, ...dimensions);
}

export function resolveProductImage(document: Document, url: string, structuredImage: unknown): { url: string; source: string } | null {
  const candidates: ImageCandidate[] = [];
  const add = (value: unknown, source: string, priority: number, original = false, width = 0) => {
    const imageUrl = safeImageUrl(value, url);
    if (imageUrl) candidates.push({ url: imageUrl, source, priority, original, resolution: imageResolution(imageUrl, width) });
  };
  const nodes = new Set(findProductNodes(document, productSelectors.image, url, false, true));
  for (const node of nodes) {
    const priority = node.matches(mainImageSelector) ? 3 : 1;
    for (const attribute of ['data-zoom-image', 'data-large-image', 'data-original', 'data-src', 'src', 'content']) {
      add(node.getAttribute(attribute), `dom:image:${attribute}`, priority, /zoom|large|original/.test(attribute));
    }
    const image = node as HTMLImageElement;
    if (image.currentSrc) add(image.currentSrc, 'dom:image:currentSrc', priority, false, image.naturalWidth || 0);
    for (const attribute of ['srcset', 'data-srcset']) {
      // 仅把“描述符之后的逗号”作为分隔符，避免破坏 URL 路径或查询中的逗号。
      const srcset = node.getAttribute(attribute) ?? '';
      for (const match of srcset.matchAll(/(?:^|,\s*)(\S+)\s+(\d+(?:\.\d+)?)(w|x)(?=\s*(?:,|$))/g)) {
        const width = Number(match[2]) * (match[3] === 'x' ? image.naturalWidth || image.width || 1 : 1);
        add(match[1], `dom:image:${attribute}`, priority, false, width);
      }
    }
    const link = node.closest('a[href]')?.getAttribute('href');
    const target = safeImageUrl(link, url);
    // 图库链接可能跳往商品页，只有明确的图片资源链接才作为原图候选。
    if (target && /\.(?:jpe?g|png|webp|avif)(?:$|\?)/i.test(target)) add(target, 'dom:image:link', priority, true);
  }
  add(structuredImage, 'jsonld:image', 2, true);
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
  try {
    if (canonical && productIdFromUrl(new URL(canonical, url).href)?.toUpperCase() === productIdFromUrl(url)?.toUpperCase()) {
      add(document.querySelector('meta[property="og:image"]')?.getAttribute('content'), 'meta:image:canonical', 0, true);
    }
  } catch { /* 无效 canonical 不能证明图片属于当前商品。 */ }

  // 同一主图的不同 CDN 尺寸共享主图优先级；不同拍摄角度不能仅凭尺寸抢占明确主图。
  const mainImages = new Set(candidates.filter((candidate) => candidate.priority === 3).map((candidate) => imageIdentity(candidate.url)));
  for (const candidate of candidates) if (mainImages.has(imageIdentity(candidate.url))) candidate.priority = 3;
  candidates.sort((left, right) => right.priority - left.priority
    || (right.resolution || (right.original ? 1024 : 0)) - (left.resolution || (left.original ? 1024 : 0))
    || Number(right.original) - Number(left.original));
  return candidates[0] ?? null;
}
