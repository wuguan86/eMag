import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PrivacyButton } from '../src/components/PrivacyButton';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('通过扩展后台打开隐私说明，使商品页和侧边栏使用同一入口', async () => {
  const sendMessage = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  render(<PrivacyButton/>);
  fireEvent.click(screen.getByRole('button', { name: '隐私与数据' }));
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'OPEN_PRIVACY_PAGE' }));
});

it('打开失败时显示可恢复的提示', async () => {
  vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn().mockRejectedValue(new Error('后台不可用')) } });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  render(<PrivacyButton/>);
  fireEvent.click(screen.getByRole('button', { name: '隐私与数据' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('请重新加载'));
});
