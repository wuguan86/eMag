import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findImageSubmit, findTopImageInput } from '../src/imageSearch/controls';

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    return (this.closest('[hidden]') ? [] : [{}]) as unknown as DOMRectList;
  });
  document.body.innerHTML = `<div class="search-image-upload-container">
    <div class="image-upload-button-container"><input id="top" type="file" accept=".jpg,.jpeg,.png,.bmp,.webp"><div>以图搜款</div></div>
    <div class="copy-image-container"><div class="search-btn">上传中...</div></div></div>
    <input id="wrong" type="file" accept="image/*"><button>搜索图片</button>`;
});
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('1688 真实顶部组件适配', () => {
  it('接受扩展名列表，仅选择顶部组件的文件框', () => {
    expect(findTopImageInput(document)?.id).toBe('top');
  });
  it('顶部入口缺失时不猜测中部加号文件框', () => {
    document.querySelector('.search-image-upload-container')?.remove();
    expect(findTopImageInput(document)).toBeNull();
    expect(findImageSubmit(document)).toBeNull();
  });
  it('隐藏或禁用的顶部组件不能接收图片', () => {
    document.querySelector('.search-image-upload-container')?.setAttribute('hidden', '');
    expect(findTopImageInput(document)).toBeNull();
    document.querySelector('.search-image-upload-container')?.removeAttribute('hidden');
    document.querySelector('#top')?.setAttribute('disabled', '');
    expect(findTopImageInput(document)).toBeNull();
  });
  it('等待 div 预览按钮完成上传，不点击全页同名按钮', () => {
    expect(findImageSubmit(document)).toBeNull();
    const submit = document.querySelector<HTMLElement>('.search-btn')!;
    submit.textContent = '搜索图片';
    expect(findImageSubmit(document)).toBe(submit);
    submit.setAttribute('aria-disabled', 'true');
    expect(findImageSubmit(document)).toBeNull();
  });
  it('PNG 专用文件框不能接收 JPEG', () => {
    document.querySelector('#top')?.setAttribute('accept', '.png');
    expect(findTopImageInput(document)).toBeNull();
  });
});
