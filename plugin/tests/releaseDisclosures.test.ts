import { describe, expect, it } from 'vitest';
import { renderPrivacyPage, normalizePublicPolicyUrl } from '../scripts/release/disclosures';

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
