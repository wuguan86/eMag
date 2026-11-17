import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FeedbackDialog } from '../src/components/FeedbackDialog';

vi.mock('../src/config/feedback', () => ({
  feedbackConfig: { wechat: 'test-wechat', qrCodePath: '' },
  getExtensionVersion: () => '1.1.0',
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('复制配置的微信号，成功后显示反馈并保留焦点循环', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(<FeedbackDialog onClose={() => {}}/>);
  expect(screen.getByText('eMAG 定制开发').tagName).toBe('STRONG');
  const close = screen.getByRole('button', { name: '关闭反馈' });
  fireEvent.keyDown(close, { key: 'Tab' });
  const copy = screen.getByRole('button', { name: '复制' });
  expect(document.activeElement).toBe(copy);
  fireEvent.click(copy);
  await waitFor(() => expect(copy.textContent).toBe('已复制'));
  expect(writeText).toHaveBeenCalledWith('test-wechat');
  fireEvent.keyDown(copy, { key: 'Tab' });
  expect(document.activeElement).toBe(close);
});

it('剪贴板拒绝访问时提示手动复制，不显示成功状态', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('访问被拒绝')) } });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  render(<FeedbackDialog onClose={() => {}}/>);
  fireEvent.click(screen.getByRole('button', { name: '复制' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('请手动复制微信号'));
  expect(screen.getByRole('button', { name: '复制' })).toBeTruthy();
});
