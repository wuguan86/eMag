import { version as packageVersion } from '../../package.json';

// 正式联系方式配置后即可展示；空值明确显示待配置，不生成虚假联系方式。
export const feedbackConfig = { wechat: 'wuguan86', qrCodePath: 'wechat-qr.png' };

export function getExtensionVersion() {
  try { return globalThis.chrome?.runtime?.getManifest?.().version || packageVersion; }
  catch { return packageVersion; }
}
