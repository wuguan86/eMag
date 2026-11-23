import { version as packageVersion } from '../../package.json';

// 构建时注入可公开的联系邮箱，反馈与欧代咨询共用此配置。
export const feedbackConfig = { email: import.meta.env.VITE_SUPPORT_EMAIL?.trim() ?? '' };

export function getExtensionVersion() {
  try { return globalThis.chrome?.runtime?.getManifest?.().version || packageVersion; }
  catch { return packageVersion; }
}
