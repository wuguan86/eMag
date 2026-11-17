export interface ProductNameTranslations { ro: string; bg: string; hu: string }

const targets = ['ro', 'bg', 'hu'] as const;
async function translateToLanguage(name: string, target: typeof targets[number]): Promise<string> {
  if (globalThis.chrome?.runtime) {
    const response = await chrome.runtime.sendMessage({ type: 'TRANSLATE_GPSR_NAME', name, target }) as { ok?: boolean; text?: string; error?: string };
    if (!response?.ok || !response.text) throw new Error(response?.error ?? '翻译服务暂不可用，请稍后重试。');
    return response.text;
  }
  const { handleGpsrTranslationRequest } = await import('./gpsrTranslationProxy');
  const response = await handleGpsrTranslationRequest({ type: 'TRANSLATE_GPSR_NAME', name, target });
  if (!response.ok) throw new Error(response.error);
  return response.text;
}

export async function translateProductName(name: string): Promise<ProductNameTranslations> {
  const normalized = name.trim();
  if (!normalized) throw new Error('请先填写中文品名。');
  const [ro, bg, hu] = await Promise.all(targets.map((target) => translateToLanguage(normalized, target)));
  return { ro, bg, hu };
}
