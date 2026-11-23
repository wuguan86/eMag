import JsBarcode from 'jsbarcode';

export const gpsrBarcodeValidationMessage = '商品码必须是 12 或 13 位数字。';

export function isValidGpsrBarcode(value: string): boolean {
  // 商品码按原值编码为 Code 128，保留前导零，由条码库计算 Code 128 的校验符。
  return /^[0-9]{12,13}$/.test(value);
}

export function renderGpsrBarcode(svg: SVGSVGElement, value: string, height: number) {
  JsBarcode(svg, value, {
    format: 'CODE128', width: 1, height, displayValue: false,
    // 左右各保留十个模块的空白，供扫描器识别条码边界。
    margin: 0, marginLeft: 10, marginRight: 10,
  });
}
