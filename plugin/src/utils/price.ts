export function parseRonPrice(text: string): number | null {
  const cleaned = text.trim().replace(/\s*(?:lei|ron)\s*$/i, '').trim().replace(/[\u00a0\u202f]/g, ' ');
  if (!/^\d[\d., ]*$/.test(cleaned)) return null;
  // 空格只能用作三位分组，不能把分离的小数或两段价格拼接成整数。
  if (cleaned.includes(' ') && !/^\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})?$/.test(cleaned)) return null;
  const compact = cleaned.replace(/ /g, '');
  let normalized: string;
  if (compact.includes(',') && compact.includes('.')) {
    const decimal = compact.lastIndexOf(',') > compact.lastIndexOf('.') ? ',' : '.';
    const separator = decimal === ',' ? '.' : ',';
    const escapedSeparator = separator === '.' ? '\\.' : ',';
    const escapedDecimal = decimal === '.' ? '\\.' : ',';
    if (!new RegExp(`^\\d{1,3}(?:${escapedSeparator}\\d{3})+${escapedDecimal}\\d{1,2}$`).test(compact)) return null;
    normalized = compact.split(separator).join('').replace(decimal, '.');
  } else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(compact)) {
    normalized = compact.replace(/[.,]/g, '');
  } else if (/^\d+(?:[.,]\d{1,2})?$/.test(compact)) {
    normalized = compact.replace(',', '.');
  } else return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

// 购买框与其他报价共用上标小数规则，不能把“129 + 99”拼成12999。
export function parseElementPrice(element: Element): number | null {
  const semantic = element.getAttribute('content') ?? element.getAttribute('data-current-price');
  if (semantic) return parseRonPrice(semantic);
  const fractional = element.querySelector('sup');
  if (!fractional) return parseRonPrice(element.textContent ?? '');
  const cents = fractional.textContent?.trim().replace(/^[.,]/, '');
  if (!cents || !/^\d{1,2}$/.test(cents)) return null;
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('sup').forEach((node) => node.remove());
  const integer = parseRonPrice(copy.textContent ?? '');
  return integer !== null && Number.isInteger(integer) ? integer + Number(cents.padEnd(2, '0')) / 100 : null;
}
