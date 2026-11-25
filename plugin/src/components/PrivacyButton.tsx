import { useState } from 'react';

export function PrivacyButton() {
  const [error, setError] = useState('');
  const openPrivacy = async () => {
    setError('');
    try {
      if (typeof globalThis.chrome?.runtime?.sendMessage === 'function') {
        const response = await chrome.runtime.sendMessage({ type: 'OPEN_PRIVACY_PAGE' });
        if (response?.ok !== true) throw new Error('扩展后台未能打开隐私说明。');
      } else {
        window.open('/privacy.html', '_blank', 'noopener,noreferrer');
      }
    } catch (reason) {
      console.warn('打开隐私说明失败。', reason);
      setError('打开失败，请重新加载扩展后重试。');
    }
  };
  return <><button type="button" className="text-button" onClick={() => { void openPrivacy(); }}>隐私与数据</button>
    {error && <p className="field-error" role="status">{error}</p>}</>;
}
