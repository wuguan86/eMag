import { describe, expect, it } from 'vitest';
import { renderPrivacyPage, renderThirdPartyNoticesPage, normalizePublicPolicyUrl } from '../scripts/release/disclosures';

describe('随包隐私说明', () => {
  it('披露本地资料、品名服务转发和图搜的实际数据流', () => {
    const html = renderPrivacyPage({ VITE_GPSR_API_ORIGIN: 'https://emag.toutouapp.cn', VITE_SUPPORT_EMAIL: 'support@example.com' });
    expect(html).toContain('品名和语言');
    expect(html).toContain('模型服务商');
    expect(html).toContain('1688');
    expect(html).toContain('chrome.storage.local');
    expect(html).toContain('会话结束');
    expect(html).toContain('https://emag.toutouapp.cn');
    expect(html).toContain('mailto:support@example.com');
    expect(html).toContain('独立第三方');
    expect(html).toContain('href="THIRD_PARTY_NOTICES.html">查看第三方许可与资产来源</a>');
    expect(html).not.toContain('<script');
  });

  it('动态运营信息进行 HTML 转义，并提供公开政策入口', () => {
    const html = renderPrivacyPage({ VITE_PUBLISHER_NAME: '<script>测试</script>', VITE_PRIVACY_POLICY_URL: 'https://example.com/privacy?a=1&b=2' });
    expect(html).toContain('&lt;script&gt;测试&lt;/script&gt;');
    expect(html).toContain('https://example.com/privacy?a=1&amp;b=2');
    expect(html).not.toContain('<script>');
  });

  it('未确认的上游保存与训练规则明确提示联系运营方核实', () => {
    const html = renderPrivacyPage({});
    expect(html).toContain('数据保存和训练规则尚待运营方确认');
    expect(html).not.toContain('永不保存');
  });

  it.each(['javascript:alert(1)', 'http://example.com/privacy', 'https://user:password@example.com/privacy', 'https://localhost/privacy', 'https://127.0.0.1/privacy'])('拒绝不安全的公开政策地址 %s', (url) => {
    expect(() => normalizePublicPolicyUrl(url)).toThrow(/HTTPS|公开|账号/);
  });
});

describe('第三方许可阅读页面', () => {
  it('使用 UTF-8 页面结构显示完整许可文本并保留原文下载', () => {
    const html = renderThirdPartyNoticesPage([
      'eMAG 卖家工具箱第三方许可声明',
      '以下收录生产依赖的许可与版权文本。',
      '',
      '========== @example/dependency@2.0.1 ==========',
      '声明许可：MIT',
      '',
      '--- LICENSE.txt ---',
      'Copyright © Example 作者。该软件按许可条款提供。',
      '',
      '========== 字体及矢量资产来源 ==========',
      '## 字体',
      '',
      '| 文件 | 许可与用途 |',
      '| --- | --- |',
      '| 示例字体 | SIL OFL 1.1 |',
    ].join('\n'));

    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<h1>第三方许可与资产来源</h1>');
    expect(html).toContain('@example/dependency');
    expect(html).toContain('声明许可：MIT');
    expect(html).toContain('<details class="license-details">');
    expect(html).toContain('点击展开完整许可文本');
    expect(html).toContain('Copyright © Example 作者');
    expect(html).toContain('字体及矢量资产来源');
    expect(html).toContain('href="THIRD_PARTY_NOTICES.txt" download');
    expect(html).not.toContain('该软件按许可条款提供。<script>');
  });
});
