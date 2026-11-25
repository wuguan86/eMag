import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

interface LockedPackage { dev?: boolean; link?: boolean }

export async function collectThirdPartyNotices(root: string) {
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8')) as {
    packages: Record<string, LockedPackage>;
  };
  const sections = ['eMAG 卖家工具箱第三方许可声明',
    '以下收录生产依赖及其传递依赖的许可与版权文本，具体打包模块由构建工具决定。'];
  for (const [location, entry] of Object.entries(lock.packages).sort(([left], [right]) => left.localeCompare(right))) {
    if (!location || entry.dev || entry.link) continue;
    const directory = path.join(root, location);
    const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')) as {
      name: string; version: string; license?: string;
    };
    const names = (await readdir(directory, { withFileTypes: true }))
      .filter((file) => file.isFile() && /(?:licen[sc]e|notice|copying|copyright|ofl)/i.test(file.name))
      .map((file) => file.name).sort();
    // 缺少依赖许可时立即报错，防止一次构建成功后未来升级又悄悄丢失版权说明。
    if (!names.length) throw new Error('依赖缺少许可文件，请核实后再发布：' + metadata.name);
    sections.push('\n========== ' + metadata.name + '@' + metadata.version + ' ==========',
      '声明许可：' + (metadata.license ?? '见以下原始许可'));
    for (const name of names) sections.push('\n--- ' + name + ' ---\n' + await readFile(path.join(directory, name), 'utf8'));
  }
  const fonts = ['Noto-OFL.txt', 'Droid-NOTICE.txt'];
  for (const name of fonts) sections.push('\n========== ' + name + ' ==========\n'
    + await readFile(path.join(root, 'src/assets/fonts', name), 'utf8'));
  sections.push('\n========== 字体及矢量资产来源 ==========\n'
    + await readFile(path.join(root, 'docs/ASSET_SOURCES.md'), 'utf8'));
  return sections.join('\n') + '\n';
}
