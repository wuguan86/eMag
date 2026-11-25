import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };
import { normalizeGpsrApiOrigin } from './src/config/gpsrApi.ts';
import { releaseDisclosures } from './scripts/release/disclosures.ts';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'VITE_');
  const origin = normalizeGpsrApiOrigin(environment.VITE_GPSR_API_ORIGIN);
  const hostPermissions = new Set(manifest.host_permissions);
  if (origin) {
    // Chrome 主机匹配规则按协议和主机授权，实际 API 请求仍使用配置中的完整来源和端口。
    const url = new URL(origin);
    hostPermissions.add(`${url.protocol}//${url.hostname}/*`);
  }
  return {
    plugins: [react(), tailwindcss(), crx({ manifest: { ...manifest, host_permissions: [...hostPermissions] } }),
      releaseDisclosures(environment, process.cwd())],
    // 离线中文字体是按需加载的完整资源，体积阈值覆盖此已知资源而非首屏脚本。
    build: { target: 'chrome120', chunkSizeWarningLimit: 5000 },
  };
});
