import { readImageSearchJobId } from '../utils/imageSearchProtocol';
import { downloadBlob } from '../utils/imageDownload';
import { findImageSubmit, findTopImageInput } from './controls';

interface ImageJobResponse {
  ok: boolean;
  job?: { jobId: string; fileName: string; imageBase64: string } | null;
  error?: string;
}

type SearchWindow = Window & { __emagImageSearchStarted?: boolean };
const pageWindow = window as SearchWindow;
if (pageWindow.__emagImageSearchStarted) {
  console.info('1688自动图搜脚本已运行，跳过重复初始化。');
} else {
  pageWindow.__emagImageSearchStarted = true;
  const jobId = readImageSearchJobId(location.hash);
  if (jobId) void runImageSearch(jobId);
}

function mountStatus(): (message: string, failed?: boolean, file?: File) => void {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:20px;top:20px;z-index:2147483647;pointer-events:none';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = ':host{all:initial}div{font:14px/1.5 Arial,sans-serif;padding:10px 14px;border-radius:6px;color:#155e45;background:#e8f6ef;box-shadow:0 2px 12px #0002;max-width:360px}div.error{color:#9b2c2c;background:#fff0f0}button{pointer-events:auto;display:block;margin-top:8px;padding:6px 10px;border:1px solid #b44;border-radius:4px;background:white;color:#922;cursor:pointer;font:13px Arial,sans-serif}';
  const message = document.createElement('div');
  shadow.append(style, message);
  document.documentElement.append(host);
  return (text, failed = false, file) => {
    message.textContent = text;
    message.classList.toggle('error', failed);
    if (failed && file) {
      const download = document.createElement('button');
      download.textContent = '下载 JPEG，手动上传';
      download.addEventListener('click', () => downloadBlob(file, file.name));
      message.append(download);
    }
  };
}

function waitFor<T>(getValue: () => T | null, stage: string, timeoutMs = 20_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const poll = () => {
      const value = getValue();
      if (value !== null) { resolve(value); return; }
      if (Date.now() - startedAt >= timeoutMs) { reject(new Error(`等待${stage}超时。`)); return; }
      window.setTimeout(poll, 200);
    };
    poll();
  });
}

async function waitForImageJob(jobId: string): Promise<NonNullable<ImageJobResponse['job']>> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    const response = await chrome.runtime.sendMessage({ type: 'TAKE_1688_IMAGE_SEARCH', jobId }) as ImageJobResponse;
    if (!response.ok) throw new Error(response.error ?? '读取待搜索图片失败。');
    if (response.job) return response.job;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  throw new Error('等待 eMAG 图片超时，请返回商品页重试。');
}

function createImageFile(job: NonNullable<ImageJobResponse['job']>): File {
  const binary = atob(job.imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], job.fileName, { type: 'image/jpeg', lastModified: Date.now() });
}

async function uploadThroughTopEntry(file: File, update: (message: string) => void): Promise<void> {
  const fileInput = await waitFor(() => findTopImageInput(document), '顶部“以图搜款”文件输入框');

  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  fileInput.dispatchEvent(new Event('input', { bubbles: true }));
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  update('图片已交给顶部上传控件，正在等待上传完成和“搜索图片”…');
  const submit = await waitFor(() => findImageSubmit(document), '上传完成后的图片卡片“搜索图片”', 40_000);
  submit.click();
}

async function runImageSearch(jobId: string): Promise<void> {
  const setStatus = mountStatus();
  history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  setStatus('正在等待商品图片并启动 1688 图搜…');
  let file: File | undefined;
  try {
    const job = await waitForImageJob(jobId);
    file = createImageFile(job);
    setStatus('图片已准备，正在使用顶部“以图搜款”入口上传…');
    await uploadThroughTopEntry(file, setStatus);
    await chrome.runtime.sendMessage({ type: 'ACK_1688_IMAGE_SEARCH', jobId });
    setStatus('已提交“搜索图片”，1688 正在加载匹配结果。');
    console.info('已自动上传商品图片并点击搜索图片。');
  } catch (error) {
    const reason = error instanceof Error ? error.message : '未知错误';
    setStatus(`自动图搜未完成：${reason} 可下载 JPEG 后用顶部“以图搜款”上传，再点击“搜索图片”。`, true, file);
    console.warn('1688自动图搜失败，保留手动上传回退。', error);
  }
}
