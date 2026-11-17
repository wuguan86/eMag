// 节点来源：1688 pc-image-search 0.0.29/213.js 的顶部上传组件。
// 中部多图上传框不是同一个入口，禁止按 document 中的先后顺序猜测文件框。
export function isVisible(element: Element): boolean {
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function acceptsJpeg(input: HTMLInputElement): boolean {
  return !input.accept || input.accept.toLowerCase().split(',').some((value) =>
    ['image/*', 'image/jpeg', '.jpg', '.jpeg'].includes(value.trim()));
}

export function findTopImageInput(document: Document): HTMLInputElement | null {
  const roots = document.querySelectorAll<HTMLElement>('.search-image-upload-container');
  for (const root of roots) {
    if (!isVisible(root)) continue;
    const inputs = root.querySelectorAll<HTMLInputElement>('.image-upload-button-container input[type="file"]');
    for (const input of inputs) {
      // 原站 input 可为透明覆盖层；以可见父容器及明确归属判断，不要求 input 可见。
      if (!input.disabled && acceptsJpeg(input)) return input;
    }
  }
  return null;
}

export function findImageSubmit(document: Document): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(
    '.search-image-upload-container .copy-image-container .search-btn');
  for (const candidate of candidates) {
    const label = (candidate.textContent ?? '').replace(/\s+/g, '');
    if (label === '搜索图片' && isVisible(candidate)
      && candidate.getAttribute('aria-disabled') !== 'true'
      && !candidate.hasAttribute('disabled')) return candidate;
  }
  return null;
}
