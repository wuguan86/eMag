export function normalizeGpsrApiOrigin(value: string | undefined): string {
  if (!value?.trim()) return '';
  try {
    const url = new URL(value.trim());
    const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
    if ((url.protocol === 'https:' || localHttp) && !url.username && !url.password
      && url.pathname === '/' && !url.search && !url.hash) return url.origin;
  } catch { /* 无效地址统一给出中文配置提示。 */ }
  throw new Error('品名服务地址必须是 HTTPS 站点根地址，本地测试可用 HTTP。');
}
