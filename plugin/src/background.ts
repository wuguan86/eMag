interface QueueImageJobMessage {
  type: 'QUEUE_1688_IMAGE_SEARCH';
  jobId: string;
  fileName: string;
  imageBase64: string;
}

interface ImageJob {
  jobId: string;
  fileName: string;
  imageBase64: string;
  expiresAt: number;
}

import { handleGpsrNameRequest } from './utils/gpsrTranslationProxy';

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
  .catch((error: unknown) => console.warn('设置工具栏侧边栏入口失败。', error));

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  if (tab.url && /^https:\/\/www\.emag\.ro\/.+\/pd\/[^/]+/.test(tab.url)) {
    void chrome.tabs.sendMessage(tab.id, { type: 'OPEN_TOOLKIT_DRAWER' })
      .catch((error: unknown) => console.warn('商品页卖家助手尚未就绪，请刷新商品页后重试。', error));
    return;
  }
  void chrome.sidePanel.open({ tabId: tab.id })
    .catch((error: unknown) => console.warn('无法打开卖家工具侧边栏。', error));
});

const jobKey = (id: string) => `emag.image-search.${id}`;
const validId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);

function senderHost(sender: chrome.runtime.MessageSender): string | null {
  try { return sender.url ? new URL(sender.url).hostname : null; }
  catch { return null; }
}

function isQueueMessage(message: unknown): message is QueueImageJobMessage {
  if (!message || typeof message !== 'object') return false;
  const candidate = message as Partial<QueueImageJobMessage>;
  return candidate.type === 'QUEUE_1688_IMAGE_SEARCH'
    && validId(candidate.jobId)
    && typeof candidate.fileName === 'string'
    && /^emag-[a-z0-9_-]+\.jpg$/i.test(candidate.fileName)
    && typeof candidate.imageBase64 === 'string'
    && candidate.imageBase64.length > 0
    && candidate.imageBase64.length <= 7_000_000;
}

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  const host = senderHost(sender);

  if (typeof message === 'object' && message !== null && 'type' in message
    && (message.type === 'REFINE_GPSR_NAME' || message.type === 'TRANSLATE_GPSR_NAME')) {
    const extensionPage = sender.url?.startsWith(chrome.runtime.getURL('/'));
    const productPage = sender.url?.startsWith('https://www.emag.ro/');
    if (sender.id !== chrome.runtime.id || !(extensionPage || productPage)) {
      respond({ ok: false, error: '品名服务请求来源无效。' });
      return;
    }
    void handleGpsrNameRequest(message).then(respond);
    return true;
  }

  if (isQueueMessage(message)) {
    if (host !== 'www.emag.ro' || !sender.url?.includes('/pd/')) {
      respond({ ok: false, error: '图搜任务只能从 eMAG 商品页创建。' });
      return;
    }
    const job: ImageJob = { ...message, expiresAt: Date.now() + 90_000 };
    void chrome.storage.session.set({ [jobKey(message.jobId)]: job })
      .then(() => respond({ ok: true }), () => respond({ ok: false, error: '无法暂存图搜图片。' }));
    return true;
  }

  if (!message || typeof message !== 'object' || !('type' in message) || !('jobId' in message)) return;
  const request = message as { type: unknown; jobId: unknown };
  if (!validId(request.jobId) || host !== 'air.1688.com' || !sender.url?.includes('/kapp/1688-search/pc-image-search')) {
    respond({ ok: false, error: '图搜任务来源或编号无效。' });
    return;
  }

  const key = jobKey(request.jobId);
  if (request.type === 'TAKE_1688_IMAGE_SEARCH') {
    void chrome.storage.session.get(key).then(async (values) => {
      const job = values[key] as ImageJob | undefined;
      if (!job || job.expiresAt < Date.now()) {
        if (job) await chrome.storage.session.remove(key);
        respond({ ok: true, job: null });
        return;
      }
      respond({ ok: true, job });
    }, () => respond({ ok: false, error: '读取图搜任务失败。' }));
    return true;
  }

  if (request.type === 'ACK_1688_IMAGE_SEARCH') {
    void chrome.storage.session.remove(key).then(() => respond({ ok: true }), () => respond({ ok: false }));
    return true;
  }
});
