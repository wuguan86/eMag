import { useState, type FormEvent } from 'react';
import { openGpsrApiSettings, saveGpsrApiToken } from '../utils/gpsrTranslation';
import { Section, TextField } from './Fields';

export function GpsrNameServiceSettings() {
  const [message, setMessage] = useState('');
  if (location.protocol === 'chrome-extension:') {
    return <details className="gpsr-name-service-settings"><summary>品名服务设置</summary><GpsrApiTokenForm/></details>;
  }
  return <div className="gpsr-name-service-settings">
    <button className="text-button" type="button" onClick={() => {
      setMessage('');
      void openGpsrApiSettings().catch((error: Error) => setMessage(error.message));
    }}>品名服务设置</button>
    {message && <p className="export-message" role="status">{message}</p>}
  </div>;
}

export function GpsrNameServiceSettingsPage() {
  return <div className="toolkit"><Section title="品名服务设置"><GpsrApiTokenForm/></Section></div>;
}

function GpsrApiTokenForm() {
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !token.trim()) return;
    setSaving(true);
    try {
      await saveGpsrApiToken(token);
      setToken('');
      setMessage('服务访问令牌已保存，可以重试提炼或翻译。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法保存服务访问令牌，请重试。');
    } finally { setSaving(false); }
  };

  return <form className="gpsr-name-service-form" onSubmit={(event) => { void save(event); }}>
      <TextField label="服务访问令牌" value={token} onChange={setToken} type="password" maxLength={256}/>
      <button className="button subtle" type="submit" disabled={saving || !token.trim()}>{saving ? '正在保存…' : '保存令牌'}</button>
      {message && <p className="export-message" role="status">{message}</p>}
  </form>;
}
