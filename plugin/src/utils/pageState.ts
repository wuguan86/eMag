import { productIdFromUrl } from './structuredProduct';

const requiredFields = ['url', 'pnk', 'has_multiple_offers', 'offers_count', 'multiple_offers_count'] as const;

function readLiteralAssignments(script: string): Map<string, unknown> | null {
  // 只静态读取白名单字段的 JSON 字面量；不执行页面代码，注释和模板字符串不构成证据。
  const code = script.replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
    (token) => token.startsWith('"') || token.startsWith("'") ? token : token.replace(/[^\r\n]/g, ' '));
  const fields = new Map<string, unknown>();
  const assignments = /^[\t ]*EM\.(url|pnk|has_multiple_offers|offers_count|multiple_offers_count)[\t ]*=[\t ]*(.+?);[\t ]*$/gm;
  for (const match of code.matchAll(assignments)) {
    if (fields.has(match[1])) return null;
    try { fields.set(match[1], JSON.parse(match[2]) as unknown); }
    catch { return null; }
  }
  return requiredFields.every((field) => fields.has(field)) ? fields : null;
}

export function readPageOtherOfferCount(document: Document, url: string): number | null {
  const productId = productIdFromUrl(url)?.toUpperCase();
  if (!productId) return null;
  const counts = new Set<number>();
  for (const script of document.querySelectorAll('script:not([src])')) {
    if (!['', 'text/javascript', 'application/javascript'].includes(script.getAttribute('type') ?? '')) continue;
    const text = script.textContent ?? '';
    if (!text.includes('EM.multiple_offers_count') || text.length > 2_000_000) continue;
    const fields = readLiteralAssignments(text);
    const identityCode = fields?.get('pnk');
    if (!fields || typeof identityCode !== 'string' || identityCode.toUpperCase() !== productId) continue;
    const identity = fields.get('url');
    if (!identity || typeof identity !== 'object' || !('path' in identity) || typeof identity.path !== 'string') continue;
    try {
      if (productIdFromUrl(new URL(identity.path, url).href)?.toUpperCase() !== productId) continue;
    } catch { continue; }
    const otherCount = fields.get('multiple_offers_count');
    const totalCount = fields.get('offers_count');
    if (typeof otherCount !== 'number' || !Number.isSafeInteger(otherCount) || otherCount < 0
      || typeof totalCount !== 'number' || !Number.isSafeInteger(totalCount) || totalCount !== otherCount + 1
      || fields.get('has_multiple_offers') !== (otherCount > 0)) continue;
    // 页面明确给出其他报价数，且与总报价及开关一致时才采用；缺失入口本身不代表零。
    counts.add(otherCount);
  }
  return counts.size === 1 ? [...counts][0] : null;
}
