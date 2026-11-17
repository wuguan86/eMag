import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  // 离线中文字体是按需加载的完整资源，体积阈值覆盖此已知资源而非首屏脚本。
  build: { target: 'chrome120', chunkSizeWarningLimit: 5000 },
});
