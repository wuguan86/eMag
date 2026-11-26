import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createReleaseArchive, verifyReleaseArchive } from '../scripts/release/archive.mjs';

function releaseFiles() {
  return {
    'manifest.json': strToU8(JSON.stringify({
      manifest_version: 3, version: '1.1.1',
      background: { service_worker: 'worker.js', type: 'module' },
      side_panel: { default_path: 'popup.html' },
      icons: { 128: 'icons/icon128.png' },
      host_permissions: ['https://emag.toutouapp.cn/*'],
    })),
    'worker.js': strToU8('import "./assets/shared.js";'),
    'assets/shared.js': strToU8('export const ready = true;'),
    'popup.html': strToU8('<script type="module" src="/assets/shared.js"></script>'),
    'icons/icon128.png': new Uint8Array([137, 80, 78, 71]),
    'privacy.html': strToU8('<h1>隐私与数据说明</h1>'),
    'THIRD_PARTY_NOTICES.html': strToU8('<h1>第三方许可与资产来源</h1>'),
    'THIRD_PARTY_NOTICES.txt': strToU8('第三方许可声明'),
    'licenses/Noto-OFL.txt': strToU8('SIL OPEN FONT LICENSE'),
    'licenses/Droid-NOTICE.txt': strToU8('Apache License'),
  };
}

describe('发布包生成和校验', () => {
  it('把 Windows 分隔符统一为标准 ZIP 路径并保留根目录清单', () => {
    const files = Object.fromEntries(Object.entries(releaseFiles()).map(([name, bytes]) => [name.replaceAll('/', String.fromCharCode(92)), bytes]));
    const bytes = createReleaseArchive(files, '1.1.1');
    const entries = unzipSync(bytes);
    expect(Object.keys(entries).some((name) => name.includes(String.fromCharCode(92)))).toBe(false);
    expect(entries['icons/icon128.png']).toBeTruthy();
    expect(verifyReleaseArchive(bytes, '1.1.1').version).toBe('1.1.1');
  });

  it.each(['privacy.html', 'THIRD_PARTY_NOTICES.html', 'THIRD_PARTY_NOTICES.txt', 'licenses/Noto-OFL.txt', 'licenses/Droid-NOTICE.txt', 'icons/icon128.png', 'assets/shared.js'])(
    '缺少必要资源 %s 时阻止生成', (name) => {
      const files = releaseFiles();
      delete files[name];
      expect(() => createReleaseArchive(files, '1.1.1')).toThrow();
    },
  );

  it.each(['.env.local', 'assets/main.js.map', '../secret.txt', '/secret.txt', 'C:/secret.txt'])('拒绝把敏感文件或越界路径 %s 放入发布包', (name) => {
    const files = { ...releaseFiles(), [name]: strToU8('测试内容') };
    expect(() => createReleaseArchive(files, '1.1.1')).toThrow();
  });

  it('拒绝规范化后重名的资源', () => {
    const files = { ...releaseFiles(), ['icons' + String.fromCharCode(92) + 'icon128.png']: new Uint8Array([1]) };
    expect(() => createReleaseArchive(files, '1.1.1')).toThrow();
  });

  it('拒绝版本不一致和本地测试服务权限', () => {
    expect(() => createReleaseArchive(releaseFiles(), '1.1.2')).toThrow(/版本/);
    const files = releaseFiles();
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    manifest.host_permissions = ['http://127.0.0.1/*'];
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    expect(() => createReleaseArchive(files, '1.1.1')).toThrow(/本地|HTTPS/);
  });

  it('实际 ZIP 校验拒绝 Windows 条目，避免绕过打包器', () => {
    const files = releaseFiles();
    files['icons' + String.fromCharCode(92) + 'icon128.png'] = files['icons/icon128.png'];
    delete files['icons/icon128.png'];
    expect(() => verifyReleaseArchive(zipSync(files), '1.1.1')).toThrow(/路径/);
  });

  it('校验相对模块引用，拒绝缺少的动态加载资源', () => {
    const files = releaseFiles();
    files['assets/shared.js'] = strToU8('export const lazy = () => import("./missing.js");');
    expect(() => createReleaseArchive(files, '1.1.1')).toThrow(/missing/);
  });
});
