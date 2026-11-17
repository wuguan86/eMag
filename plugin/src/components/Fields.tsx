import { useId, useState, type ReactNode } from 'react';
import { cn } from '../utils/cn';

export function TextField({ label, value, onChange, multiline, optional, type = 'text', placeholder, maxLength = 2000 }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean;
  optional?: boolean; type?: string; placeholder?: string; maxLength?: number;
}) {
  const id = useId();
  const attributes = { id, value, maxLength, placeholder, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value) };
  return <div className="field"><label htmlFor={id}>{label}{optional && <span className="muted"> · 选填</span>}</label>
    {multiline ? <textarea {...attributes} rows={3}/> : <input {...attributes} type={type}/>}
  </div>;
}

export function NumberField({ label, value, onCommit, onValidity, suffix, max = Number.MAX_SAFE_INTEGER, allowEmpty = false, positive = false }: {
  label: string; value: number | null; onCommit: (value: number | null) => void;
  onValidity?: (valid: boolean) => void; suffix?: string; max?: number; allowEmpty?: boolean; positive?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(false);
  const validate = (text: string) => {
    if (!text.trim()) return allowEmpty;
    const number = Number(text);
    return Number.isFinite(number) && (positive ? number > 0 : number >= 0) && number <= max;
  };
  return <div className="field"><label htmlFor={id}>{label}</label><div className={cn('input-wrap', error && 'invalid')}>
    <input id={id} type="text" inputMode="decimal" autoComplete="off" aria-invalid={error} aria-describedby={error ? `${id}-error` : undefined}
      value={editing || error ? draft : value ?? ''}
      onFocus={() => { setDraft(value === null ? '' : String(value)); setEditing(true); }}
      onChange={(event) => { setDraft(event.target.value); onValidity?.(validate(event.target.value)); }}
      onBlur={() => {
        const valid = validate(draft);
        setError(!valid); setEditing(false); onValidity?.(valid);
        if (valid) onCommit(draft.trim() ? Number(draft) : null);
      }}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}/>
    {suffix && <span>{suffix}</span>}</div>
    {error && <p className="field-error" id={`${id}-error`}>请输入{positive ? '大于零' : '非负'}且不超过 {max === Number.MAX_SAFE_INTEGER ? '安全范围' : max} 的数字</p>}
  </div>;
}

export function Section({ title, detail, action, id, children }: { title: string; detail?: string; action?: ReactNode; id?: string; children: ReactNode }) {
  return <section className="section" id={id}><div className="section-heading"><h2>{title}</h2>{action ?? (detail && <span className="muted">{detail}</span>)}</div>{children}</section>;
}
