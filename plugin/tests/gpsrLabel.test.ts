import { describe, expect, it } from 'vitest';
import { isValidEan13, isValidManualUrl, resolveGpsrPageSize } from '../src/utils/gpsrLabel';

describe('GPSR 标签数据校验', () => {
  it('仅接受校验位正确的 13 位 EAN-13', () => {
    expect(isValidEan13('5901234123457')).toBe(true);
    expect(isValidEan13('5901234123458')).toBe(false);
    expect(isValidEan13('590123412345')).toBe(false);
    expect(isValidEan13('59012341234a7')).toBe(false);
  });

  it('仅接受说明书网页或 PDF 的 HTTP(S) 地址', () => {
    expect(isValidManualUrl('https://example.com/manual.pdf')).toBe(true);
    expect(isValidManualUrl('http://example.com/safety')).toBe(true);
    expect(isValidManualUrl('javascript:alert(1)')).toBe(false);
    expect(isValidManualUrl('file:///manual.pdf')).toBe(false);
    expect(isValidManualUrl('not a url')).toBe(false);
  });

  it('为预设尺寸和横向方向返回准确页面尺寸', () => {
    expect(resolveGpsrPageSize({ labelSize: '70x80', customWidth: 70, customHeight: 80, orientation: 0 }))
      .toEqual({ width: 70, height: 80, margin: 2 });
    expect(resolveGpsrPageSize({ labelSize: '70x80', customWidth: 70, customHeight: 80, orientation: 90 }))
      .toEqual({ width: 80, height: 70, margin: 2 });
    expect(resolveGpsrPageSize({ labelSize: 'custom', customWidth: 90, customHeight: 110, orientation: 0 }))
      .toEqual({ width: 90, height: 110, margin: 2 });
  });

  it('拒绝低于自定义尺寸下限的页面', () => {
    expect(() => resolveGpsrPageSize({ labelSize: 'custom', customWidth: 69, customHeight: 80, orientation: 0 }))
      .toThrow('70 × 80 mm');
  });
});
