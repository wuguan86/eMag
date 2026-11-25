import { readFile, readdir, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { createReleaseArchive, verifyReleaseArchive } from './release/archive.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

async function readBuildFiles(directory, prefix = '') {
  const files = Object.create(null);
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + item.name;
    if (item.isSymbolicLink()) throw new Error('构建目录不能包含符号链接：' + name);
    if (item.isDirectory()) Object.assign(files, await readBuildFiles(path.join(directory, item.name), name + '/'));
    else if (item.isFile()) files[name] = new Uint8Array(await readFile(path.join(directory, item.name)));
  }
  return files;
}

function checkReleaseConfiguration() {
  const environment = loadEnv('production', root, 'VITE_');
  const origin = environment.VITE_GPSR_API_ORIGIN?.trim();
  // 正式包包含翻译入口，阻止遗漏服务地址或误把本地联调配置交给卖家。
  if (!origin || !origin.startsWith('https://')) {
    throw new Error('请在 .env.local 配置正式 HTTPS 品名服务地址 VITE_GPSR_API_ORIGIN 后再打包。');
  }
  const url = new URL(origin);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || /^(?:localhost|127\.|0\.|10\.|192\.168\.)/.test(url.hostname)) {
    throw new Error('正式品名服务必须使用公开 HTTPS 站点根地址。');
  }
  if (!environment.VITE_SUPPORT_EMAIL?.trim()) throw new Error('请配置公开联系邮箱 VITE_SUPPORT_EMAIL 后再打包。');
  const missing = ['VITE_PUBLISHER_NAME', 'VITE_PRIVACY_POLICY_URL', 'VITE_MODEL_PROVIDER', 'VITE_DATA_RETENTION_NOTICE']
    .filter((name) => !environment[name]?.trim());
  if (missing.length) console.warn('上架资料仍待运营方补充，随包说明会如实显示待确认项：' + missing.join('、'));
  return url.origin;
}

try {
  if (process.argv[2] === '--verify') {
    if (!process.argv[3]) throw new Error('请提供要校验的 ZIP 路径。');
    const archivePath = path.resolve(process.cwd(), process.argv[3]);
    const report = verifyReleaseArchive(new Uint8Array(await readFile(archivePath)), metadata.version);
    console.log('ZIP 校验通过，版本 ' + report.version + '，资源文件 ' + report.entryCount + ' 个。');
  } else {
    const apiOrigin = checkReleaseConfiguration();
    if (process.argv[2] === '--check-config') {
      console.log('正式构建配置检查通过，品名服务为 ' + apiOrigin + '。');
    } else {
      const files = await readBuildFiles(path.join(root, 'dist'));
      const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
      if (!manifest.host_permissions?.includes(apiOrigin + '/*')) throw new Error('构建包的品名站点权限与当前配置不一致，请重新构建。');
      const archive = createReleaseArchive(files, metadata.version);
      const report = verifyReleaseArchive(archive, metadata.version);
      const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date()).replaceAll('-', '');
      const directory = path.join(root, 'release');
      await mkdir(directory, { recursive: true });
      const output = path.join(directory, 'eMAG-seller-toolkit-' + metadata.version + '-' + date + '.zip');
      const temporary = output + '.tmp-' + process.pid;
      await writeFile(temporary, archive);
      await rename(temporary, output);
      console.log('发布包已生成并校验：' + output);
      console.log('版本 ' + report.version + '，资源文件 ' + report.entryCount + ' 个，ZIP 大小 ' + archive.length + ' 字节。');
    }
  }
} catch (error) {
  console.error('发布包处理失败。', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
