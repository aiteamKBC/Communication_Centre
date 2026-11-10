import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError, post } from '../api';
import { when } from './model';

type Values = {
  reminders_enabled: boolean; email_mode: 'dry_run' | 'live'; reminder_days: number[]; escalate_day: number;
  reminder_types: string[]; daily_cap: number; escalation_cc: string;
};
type Change = { id: number; previous: Values | null; value: Values; reason: string; actor: string; created_at: string };
type Data = {
  values: Values; defaults: Values; revision: number; set_up: boolean; not_set_up: string;
  reminder_types: { key: string; label: string }[];
  sending: { configured: boolean; sender: string; missing: string[]; live_allowed: boolean };
  history: Change[];
};

const LABELS: Record<keyof Values, string> = {
  reminders_enabled: 'Automatic reminders', email_mode: 'Sending', reminder_days: 'Reminder days',
  escalate_day: 'Manager escalation day', reminder_types: 'Case types', daily_cap: 'Daily limit per learner',
  escalation_cc: 'Manager copy address',
};
const errorText = (reason: unknown) => (reason instanceof Error ? reason.message : 'Something went wrong. Try again.');

function show(key: keyof Values, value: Values[keyof Values], types: Map<string, string>) {
  if (key === 'reminders_enabled') return value ? 'On' : 'Off';
  if (key === 'email_mode') return value === 'live' ? 'Send for real' : 'Record only (dry run)';
  if (key === 'reminder_days') return (value as number[]).map(day => (day === 0 ? 'when the case opens' : `day ${day}`)).join(', ');
  if (key === 'escalate_day') return value ? `day ${value}` : 'never';
  if (key === 'reminder_types') return (value as string[]).map(type => types.get(type) || type).join(', ') || 'none';
  return String(value || 'none');
}

/** What a save changes, in words, so the director confirms exactly that. */
function changes(before: Values, after: Values, types: Map<string, string>) {
  return (Object.keys(LABELS) as (keyof Values)[])
    .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(key => `${LABELS[key]}: ${show(key, before[key], types)} → ${show(key, after[key], types)}`);
}

const parseDays = (text: string) => text.split(',').map(part => part.trim()).filter(Boolean).map(Number);

/** Director settings: the automatic reminder emails and whether email is really sent. Every save keeps its reason. */
// Automatic reminders are not released yet: shown as "Coming soon" and locked. The backend sends none either
// (AUTOMATIC_REMINDERS_AVAILABLE in callcentre/emails.py); release both together.
const REMINDERS_AVAILABLE = false;

export default function Settings({ csrf }: { csrf: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState<Values | null>(null);
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    try {
      const value = await api<Data>('settings/');
      setData(value);
      setDraft(value.values);
      setDays(value.values.reminder_days.join(', '));
      setLoadError('');
    } catch (reason) {
      setLoadError(errorText(reason));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const types = useMemo(() => new Map((data?.reminder_types || []).map(t => [t.key, t.label])), [data]);
  const dayList = parseDays(days);
  const daysValid = dayList.length > 0 && dayList.length <= 10 && dayList.every(day => Number.isInteger(day) && day >= 0 && day <= 60);
  const next = draft && { ...draft, reminder_days: daysValid ? [...new Set(dayList)].sort((a, b) => a - b) : draft.reminder_days };
  const pending = data && next ? changes(data.values, next, types) : [];

  if (loadError) return <section className="ec-card"><h2>Settings</h2><p className="ec-alert" role="alert">{loadError}</p><button type="button" onClick={() => void load()}>Try again</button></section>;
  if (!data || !draft || !next) return <section className="ec-card"><p role="status">Loading settings…</p></section>;

  const update = (patch: Partial<Values>) => { setDraft({ ...draft, ...patch }); setSaved(''); setError(''); };
  const readOnly = !data.set_up;
  const goingLive = REMINDERS_AVAILABLE && next.reminders_enabled && next.email_mode === 'live';

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!next || !data) return;
    setBusy(true);
    setError('');
    try {
      await post('settings/', csrf, { values: next, revision: data.revision, reason: reason.trim() });
      setReason('');
      setSaved('Settings saved.');
      await load();
    } catch (failure) {
      setError(errorText(failure));
      if (failure instanceof ApiError && failure.status === 409) await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ec-stack ec-settings" onSubmit={save}>
      {readOnly && <p className="ec-alert" role="alert">{data.not_set_up} The values below are the built-in defaults.</p>}

      <section className="ec-card">
        <h2>Sending email</h2>
        <p className={data.sending.configured ? 'ec-alert ec-success' : 'ec-alert'}>
          {data.sending.configured
            ? `Microsoft 365 is ready. Emails go out as ${data.sending.sender}.`
            : `Microsoft 365 is not ready: add ${data.sending.missing.join(', ')} to the server settings (.env).`}
        </p>
        {!data.sending.live_allowed && (
          <p className="ec-alert" role="note">This server only records emails: CALLCENTRE_EMAIL_LIVE_ALLOWED is not set in its .env. Change the sending mode on the production server.</p>
        )}
        <fieldset disabled={readOnly}>
          <legend>When an email is due</legend>
          <label className="ec-choice"><input type="radio" name="email-mode" checked={draft.email_mode === 'dry_run'} onChange={() => update({ email_mode: 'dry_run' })} /> Record only (dry run): nothing is sent, the email is kept on the case</label>
          <label className="ec-choice"><input type="radio" name="email-mode" checked={draft.email_mode === 'live'} disabled={!data.sending.configured || !data.sending.live_allowed} onChange={() => update({ email_mode: 'live' })} /> Send for real (live)</label>
        </fieldset>
      </section>

      <section className="ec-card">
        <h2>Automatic reminders {!REMINDERS_AVAILABLE && <span className="ec-tag amber">Coming soon</span>}</h2>
        <p className="ec-muted">Emails the case cycle sends to learners about their open cases, on the college template with the right booking link.</p>
        {!REMINDERS_AVAILABLE && <p className="ec-alert" role="note">Automatic reminders are not available yet. No reminder emails are sent.</p>}
        <fieldset disabled={readOnly || !REMINDERS_AVAILABLE}>
          <label className="ec-choice"><input type="checkbox" checked={draft.reminders_enabled} onChange={event => update({ reminders_enabled: event.target.checked })} /> Send automatic reminders</label>
          <div className="ec-form">
            <label>Email the learner on these days (0 = when the case opens)
              <input value={days} inputMode="numeric" aria-invalid={!daysValid} onChange={event => { setDays(event.target.value); setSaved(''); }} />
              {!daysValid && <small className="danger">Up to 10 whole numbers from 0 to 60, separated by commas.</small>}
            </label>
            <label>Email the line manager on day (0 = never)
              <input type="number" min={0} max={60} value={draft.escalate_day} onChange={event => update({ escalate_day: Number(event.target.value) })} />
            </label>
            <label>Most emails per learner per day
              <input type="number" min={0} max={10} value={draft.daily_cap} onChange={event => update({ daily_cap: Number(event.target.value) })} />
            </label>
            <label>Copy manager emails to (optional)
              <input type="email" value={draft.escalation_cc} placeholder="team@kentbusinesscollege.com" onChange={event => update({ escalation_cc: event.target.value })} />
            </label>
          </div>
          <fieldset>
            <legend>Send reminders for</legend>
            <div className="ec-checks">
              {data.reminder_types.map(type => (
                <label key={type.key}>
                  <input type="checkbox" checked={draft.reminder_types.includes(type.key)}
                    onChange={event => update({ reminder_types: event.target.checked ? [...draft.reminder_types, type.key] : draft.reminder_types.filter(key => key !== type.key) })} />
                  {type.label}
                </label>
              ))}
            </div>
          </fieldset>
        </fieldset>
        {REMINDERS_AVAILABLE && <p className="ec-muted">Reminders go out when the case cycle runs. A cycle started with <code>--skip-emails</code> sends none.</p>}
      </section>

      {!readOnly && (
        <section className="ec-card">
          <h2>Save changes</h2>
          {pending.length ? <ul>{pending.map(line => <li key={line}>{line}</li>)}</ul> : <p className="ec-muted">No changes yet.</p>}
          {goingLive && pending.length > 0 && <p className="ec-alert" role="alert">Learners and line managers will receive real emails from {data.sending.sender}. Only reminders that fall due from today are sent, not the backlog.</p>}
          <label>Why are you changing this?
            <input value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} placeholder="For example: start reminders for missed lectures" />
          </label>
          {error && <p className="ec-alert" role="alert">{error}</p>}
          <p role="status">{saved}</p>
          <div className="ec-buttons">
            <button type="submit" className="primary" disabled={busy || !pending.length || !daysValid || reason.trim().length < 5}>{busy ? 'Saving…' : 'Save settings'}</button>
            {pending.length > 0 && <button type="button" onClick={() => { setDraft(data.values); setDays(data.values.reminder_days.join(', ')); setError(''); }}>Undo changes</button>}
          </div>
        </section>
      )}

      <section className="ec-card">
        <h2>Change history</h2>
        {data.history.length ? (
          <ul className="ec-settings-history">
            {data.history.map(item => (
              <li key={item.id}>
                <strong>{when(item.created_at)}</strong> · {item.actor} · “{item.reason}”
                <ul>{changes(item.previous || data.defaults, item.value, types).map(line => <li key={line}>{line}</li>)}</ul>
              </li>
            ))}
          </ul>
        ) : <p className="ec-muted">No changes saved yet.</p>}
      </section>
    </form>
  );
}
