import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { normalizeGpsrApiOrigin } from '../../src/config/gpsrApi.ts';
import { collectThirdPartyNotices } from './notices.ts';

type PublicEnvironment = Record<string, string | undefined>;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

export function normalizePublicPolicyUrl(value: string | undefined) {
  if (!value?.trim()) return '';
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error('公开隐私政策地址必须是有效的 HTTPS 地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('公开隐私政策必须使用 HTTPS，地址不能包含账号或密码。');
  }
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname === '[::1]'
    || /^(?:127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname)) {
    throw new Error('公开隐私政策不能使用本机或局域网地址。');
  }
  return url.href;
}

export function renderPrivacyPage(environment: PublicEnvironment) {
  const origin = normalizeGpsrApiOrigin(environment.VITE_GPSR_API_ORIGIN);
  const policyUrl = normalizePublicPolicyUrl(environment.VITE_PRIVACY_POLICY_URL);
  const email = environment.VITE_SUPPORT_EMAIL?.trim() ?? '';
  if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error('公开联系邮箱格式无效。');
  const publisher = environment.VITE_PUBLISHER_NAME?.trim();
  const provider = environment.VITE_MODEL_PROVIDER?.trim();
  const retention = environment.VITE_DATA_RETENTION_NOTICE?.trim();
  return [
    '<!doctype html>', '<html lang="zh-CN"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>隐私与数据说明 · eMAG 卖家工具箱</title>',
    '<style>body{margin:0;background:#f5f7fb;color:#25324a;font:15px/1.8 system-ui,sans-serif}main{max-width:860px;margin:32px auto;padding:32px;background:#fff;border:1px solid #dce4f0;border-radius:12px}h1{font-size:26px;line-height:1.4}h2{font-size:18px;margin-top:28px}a{color:#1d4ed8;overflow-wrap:anywhere}code{overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:left;border:1px solid #dce4f0;vertical-align:top}.notice{padding:14px;background:#fff8e5;border-left:4px solid #d69b20}@media(max-width:600px){main{margin:0;padding:22px;border:0;border-radius:0}table{font-size:13px}td,th{padding:7px}}</style>',
    '</head><body><main><h1>隐私与数据说明</h1>',
    '<p>适用产品为 eMAG 卖家工具箱。说明更新日期为 2026 年 11 月 25 日。</p>',
    '<p>本扩展是独立第三方卖家辅助工具，用于商品信息读取、利润试算、1688 图搜和 GPSR 标签制作。eMAG、1688 的商标归各自权利人所有。</p>',
    '<h2>一、运营与联系</h2>',
    publisher ? '<p>运营主体为 ' + escapeHtml(publisher) + '。</p>'
      : '<p class="notice">运营主体名称尚待补充，请通过联系邮箱向运营方确认。</p>',
    email ? '<p>联系邮箱为 <a href="mailto:' + escapeHtml(email) + '">' + escapeHtml(email) + '</a>。</p>'
      : '<p class="notice">公开联系邮箱尚待运营方配置。</p>',
    policyUrl ? '<p><a href="' + escapeHtml(policyUrl) + '" target="_blank" rel="noopener noreferrer">查看运营方公开隐私政策</a></p>'
      : '<p class="notice">完整公开隐私政策地址尚待运营方配置。本页记录当前扩展的技术数据流，服务运营信息仍需补充。</p>',
    '<h2>二、本机保存的数据</h2>',
    '<p>企业名称、地址、邮箱、联系人资料、企业模板、商品表单、采购成本及试算参数保存在浏览器的 <code>chrome.storage.local</code> 中。扩展独立开发预览使用 localStorage。本机 PDF 生成使用随包字体，导出文件由你保存。</p>',
    '<p>可通过表单清空商品信息、删除企业模板。卸载扩展可移除其浏览器本机存储。</p>',
    '<h2>三、品名提炼与翻译</h2>',
    '<p>点击“从当前商品导入”会读取当前商品标题并自动请求品名提炼；点击提炼或翻译按钮也会发起对应请求。请求发送品名和语言，用于生成短品名及译文。</p>',
    origin ? '<p>本次构建的品名服务地址为 <code>' + escapeHtml(origin) + '</code>。后台会把该次请求转交配置的模型服务商处理。</p>'
      : '<p>本次构建未配置品名服务地址，提炼和翻译需要运营方配置服务后才能使用。</p>',
    provider ? '<p>运营方声明的模型服务商为 ' + escapeHtml(provider) + '。</p>'
      : '<p class="notice">模型服务商名称尚待运营方确认。</p>',
    '<p>品名请求的业务字段为品名和语言。网络连接会使服务接收方接触到建立连接所需的 IP 等网络信息。公司表单和采购成本通过本机存储逻辑保存。</p>',
    '<h2>四、1688 图片搜索</h2>',
    '<p>点击图搜后，扩展从商品图片地址读取图片、在本机转为 JPEG，交给 1688 图片搜索页上传和搜索。图片会提交给 1688，用于查找相似商品，其后续处理适用 1688 的规则。</p>',
    '<p>图片任务使用浏览器会话存储，任务有效期为 90 秒，完成确认或读取到失效任务时会删除。未再次读取的失效任务可能保留到当前浏览器会话结束。手动下载的图片由你管理。</p>',
    '<h2>五、权限用途</h2>',
    '<table><thead><tr><th>权限或站点</th><th>对应功能</th></tr></thead><tbody>',
    '<tr><td>storage</td><td>保存本机表单、模板、试算参数及图搜会话任务。</td></tr>',
    '<tr><td>activeTab、scripting</td><td>在你操作扩展时读取当前受支持商品页的标题。</td></tr>',
    '<tr><td>sidePanel</td><td>打开浏览器侧边栏中的 GPSR 标签表单。</td></tr>',
    '<tr><td>www.emag.ro</td><td>注入商品助手，读取罗马尼亚站商品信息。</td></tr>',
    '<tr><td>air.1688.com、detail.1688.com</td><td>执行用户发起的图片搜索及商品标题导入。</td></tr>',
    '<tr><td>品名服务站点</td><td>提交你主动触发的品名提炼与翻译请求。</td></tr>',
    '</tbody></table>',
    '<h2>六、服务日志、第三方保存与删除请求</h2>',
    '<p>项目的品名服务应用日志记录操作类型、状态和耗时。部署层日志及模型服务商的数据处理情况需要由运营方另行确认。</p>',
    retention ? '<p>' + escapeHtml(retention).replaceAll('\n', '<br>') + '</p>'
      : '<p class="notice">日志保留期限、第三方的数据保存和训练规则尚待运营方确认。使用品名服务前可通过上述联系邮箱核实，或提出访问与删除请求。</p>',
    '<h2>七、适用范围与使用核对</h2>',
    '<p>商品解析当前适配 eMAG 罗马尼亚站，RO、BG、HU 品名及 VAT 参考切换的具体用途请结合界面说明使用。利润试算与标签内容需要你核对实际费用、法规、标准、标志适用性及译文。</p>',
    '<p><a href="THIRD_PARTY_NOTICES.txt">查看第三方许可与资产来源</a></p>',
    '</main></body></html>',
  ].join('\n');
}

export function releaseDisclosures(environment: PublicEnvironment, root: string): Plugin {
  const privacyPage = renderPrivacyPage(environment);
  return {
    name: 'release-disclosures',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/privacy.html') return next();
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(privacyPage);
      });
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'privacy.html', source: privacyPage });
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.txt', source: await collectThirdPartyNotices(root) });
      for (const name of ['Noto-OFL.txt', 'Droid-NOTICE.txt']) {
        this.emitFile({ type: 'asset', fileName: 'licenses/' + name,
          source: await readFile(path.join(root, 'src/assets/fonts', name), 'utf8') });
      }
    },
  };
}
