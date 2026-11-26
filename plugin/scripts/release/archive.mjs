import { posix } from 'node:path';
import { strFromU8, unzipSync, zipSync } from 'fflate';

const requiredFiles = [
  'manifest.json', 'privacy.html', 'THIRD_PARTY_NOTICES.html', 'THIRD_PARTY_NOTICES.txt',
  'licenses/Noto-OFL.txt', 'licenses/Droid-NOTICE.txt',
];

function checkPath(name) {
  if (!name || name.includes('\\') || name.startsWith('/') || /^[a-z]:/i.test(name)
    || name.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('发布包资源路径无效：' + name);
  }
  if (name.split('/').some((part) => /^\.env(?:\.|$)/i.test(part) || ['node_modules', 'src', 'tests', '.git'].includes(part))
    || /\.(?:map|ts|tsx)$/i.test(name)) {
    throw new Error('发布包包含开发文件或敏感文件：' + name);
  }
}

function validateFiles(files, expectedVersion) {
  const names = Object.keys(files);
  names.forEach(checkPath);
  const requireFile = (name, owner = '发布包') => {
    if (!files[name]?.length) throw new Error(owner + ' 引用的资源不存在或为空：' + name);
  };
  requiredFiles.forEach((name) => requireFile(name));
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  if (manifest.manifest_version !== 3) throw new Error('发布包必须使用 Manifest V3。');
  if (manifest.version !== expectedVersion) throw new Error('发布包版本与 package.json 不一致。');

  const hosts = [...(manifest.host_permissions ?? []), ...(manifest.optional_host_permissions ?? [])];
  for (const host of hosts) {
    if (!host.startsWith('https://') || /\/\/(?:localhost|127\.[\d.]+|\[::1\])(?=[:/])/i.test(host)) {
      throw new Error('发布包站点权限必须使用公开 HTTPS 地址，不能包含本地测试服务：' + host);
    }
  }

  const references = [manifest.background?.service_worker, manifest.action?.default_popup,
    manifest.side_panel?.default_path, manifest.options_page, manifest.options_ui?.page,
    ...Object.values(manifest.icons ?? {}), ...Object.values(manifest.action?.default_icon ?? {}),
    ...(manifest.content_scripts ?? []).flatMap((script) => [...(script.js ?? []), ...(script.css ?? [])]),
    ...(manifest.web_accessible_resources ?? []).flatMap((group) => group.resources ?? [])].filter(Boolean);
  for (const name of references) {
    if (name.includes('*')) {
      const pattern = new RegExp('^' + name.split('*').map((part) => part.replace(/[.*+?^$()|[\]{}]/g, '\\$&')).join('.*') + '$');
      if (!names.some((candidate) => pattern.test(candidate))) throw new Error('清单中的资源模式没有匹配文件：' + name);
    } else requireFile(name, 'Manifest');
  }

  // 同时校验编译后的入口与懒加载模块，避免只检查 manifest 而漏掉字体或共享代码。
  for (const [name, bytes] of Object.entries(files)) {
    if (!/\.(?:html|js|css)$/.test(name)) continue;
    const source = strFromU8(bytes);
    const imports = name.endsWith('.html')
      ? [...source.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/gi)].map((match) => match[1])
      : name.endsWith('.js')
        ? [...source.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/g)].map((match) => match[1])
        : [...source.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)].map((match) => match[1]);
    for (const reference of imports) {
      if (reference.startsWith('data:') || reference.startsWith('#')) continue;
      if (/^(?:https?:)?\/\//.test(reference)) throw new Error('扩展执行资源必须随包提供：' + reference);
      if (!reference.startsWith('.') && !reference.startsWith('/') && name.endsWith('.js')) continue;
      const resource = reference.split(/[?#]/)[0];
      const resolved = resource.startsWith('/') ? resource.slice(1) : posix.join(posix.dirname(name), resource);
      checkPath(resolved);
      requireFile(resolved, name);
    }
  }
  return { version: manifest.version, entryCount: names.length };
}

export function verifyReleaseArchive(bytes, expectedVersion) {
  return validateFiles(unzipSync(bytes), expectedVersion);
}

export function createReleaseArchive(files, expectedVersion) {
  const normalized = Object.create(null);
  for (const [name, bytes] of Object.entries(files)) {
    const path = name.replaceAll('\\', '/');
    if (Object.hasOwn(normalized, path)) throw new Error('发布包资源路径重复：' + path);
    normalized[path] = bytes;
  }
  validateFiles(normalized, expectedVersion);
  const archive = zipSync(normalized, { level: 9 });
  verifyReleaseArchive(archive, expectedVersion);
  return archive;
}
