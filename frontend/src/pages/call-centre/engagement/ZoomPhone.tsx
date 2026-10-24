import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { accountLabel, api, londonDay, post, request, useCallCentre } from '../api';
import type { Overview } from '../api';
import Dialog from './Dialog';
import ErrorNotice, { Field } from './ErrorNotice';
import { fieldProblem, focusField } from './formErrors';
import type { FieldProblem, Problem } from './formErrors';
import ZoomAccountsSection from './ZoomAccounts';
import type { ZoomAccount, ZoomAccounts } from './ZoomAccounts';
import { human, when } from './model';
import RecordingDialog from './Recordings';
import TranscriptsDialog from './Transcripts';

type Metrics = { calls: number; answered: number; not_answered: number; other: number; duration_seconds: number; answered_duration_seconds: number; missing_duration: number };
type Account = Metrics & { key: string; label: string; configured: boolean; missing_settings?: string[]; last_success_at: string | null; covered_through?: string | null; syncing: boolean; error: string; recordings_error?: string; recordings_last_success_at?: string | null };
type Call = {
  id: number; source_account: string; direction: string; caller_number: string; caller_name: string; caller_email: string; callee_number: string; callee_name: string;
  started_at: string; contact_name: string; contact_email: string; contact_role: string; duration_seconds: number | null; result: string; raw_result: string;
};
type Report = { timezone: string; accounts: Account[]; totals: Metrics; calls: Call[]; daily: (Metrics & { date: string; source_account: string })[]; page: number; total_records: number; has_next: boolean };
type AgentProfile = { id: number; user_id: number; user_email: string; display_name: string; zoom_email: string; zoom_user_id: string; zoom_phone_number: string; zoom_account: string; daily_talk_target_minutes: number; active: boolean };
type Form = Omit<AgentProfile, 'id' | 'user_email'>;
type ActivityLog = { month: string; months: string[]; daily: { date: string; calls: number; answered: number; not_answered: number }[]; total_calls: number; recent_calls: { id: number; date: string; phone: string; answered: boolean; learner_name: string; learner_email: string; coach: string }[] };

type LineTest = {
  status: string; label: string; tested_at: string; calls_7_days: number; matched_7_days: number; unmatched_7_days: number;
  last_call_at: string | null; transcripts_ready_7_days: number; transcripts_waiting_7_days: number; agents: string[];
  zoom: { checked: boolean; found: boolean | null; account: string; status: string; assignee: string; problem: string };
  warnings: string[];
};
type Holder = { id: number; name: string; active: boolean; account: string };
/** A number and everything Zoom uses to recognise it. */
type LineFields = { number: string; label: string; account: string; zoom_email: string; zoom_user_id: string };
type Line = LineFields & { test: LineTest | null; agents: Holder[]; zoom_name?: string; zoom_owner?: string; refreshed_at?: string };
type Refreshed = { numbers: number; changes: string[]; not_in_zoom: string[]; problems: string[] };
type Lines = { lines: Line[]; unlisted: { number: string; agents: Holder[] }[]; scope: string };
type Found = { account: string; zoom_email: string; zoom_user_id: string; calls_90_days: number; zoom: LineTest['zoom'] };
const emptyLine: LineFields = { number: '', label: '', account: '', zoom_email: '', zoom_user_id: '' };

const emptyForm: Form = { user_id: 0, display_name: '', zoom_email: '', zoom_user_id: '', zoom_phone_number: '', zoom_account: '', daily_talk_target_minutes: 180, active: true };
const roles: Record<string, string> = { learner: 'Learner', line_manager: 'Line manager' };
const seconds = (value: number | null) => (value === null ? 'Duration not supplied' : `${Math.floor(value / 60)}m ${value % 60}s`);
const hoursText = (value: number) => (value / 3600).toFixed(2);

function contact(call: Call) {
  const outbound = call.direction === 'outbound';
  const name = call.contact_name || (outbound ? call.callee_name : call.caller_name) || 'Unmatched number';
  return { name, role: roles[call.contact_role] || 'Unmatched number', number: outbound ? call.callee_number : call.caller_number };
}

const STATUS_TONE: Record<string, string> = { working: 'green', ready: 'green', unmatched: 'amber', check_setup: 'red', no_agent: 'amber', not_found: 'red' };

/** What a number's last Test found, in words. */
function testDetail(test: LineTest) {
  const zoom = test.zoom.found ? `In Zoom (${test.zoom.account}${test.zoom.assignee ? `, assigned to ${test.zoom.assignee}` : ''}).`
    : test.zoom.found === false ? 'Not in any of the Zoom accounts.' : `Not checked in Zoom: ${test.zoom.problem || 'no Zoom account is set up'}.`;
  const calls = test.calls_7_days
    ? `${test.calls_7_days} ${test.calls_7_days === 1 ? 'call' : 'calls'} in the last 7 days, ${test.matched_7_days} matched to a specialist.`
    : `No calls in the last 7 days${test.last_call_at ? ` (last call ${when(test.last_call_at)})` : ''}.`;
  const unmatched = test.unmatched_7_days
    ? ` ${test.unmatched_7_days} not matched: made from the Zoom app directly, or by someone who does not have this number.` : '';
  const transcripts = test.transcripts_ready_7_days || test.transcripts_waiting_7_days
    ? ` Transcripts: ${test.transcripts_ready_7_days} ready, ${test.transcripts_waiting_7_days} waiting.` : '';
  return `${zoom} ${calls}${unmatched}${transcripts}`;
}

/** The Zoom numbers the team calls from, each with what Zoom uses to recognise it: add, Fill from Zoom, Test, and give
 * each specialist one (in their profile). */
function PhoneLines({ csrf, data, accounts, onChanged }: { csrf: string; data: Lines | null; accounts: ZoomAccount[]; onChanged: () => void }) {
  const [form, setForm] = useState<LineFields>(emptyLine);
  const [editing, setEditing] = useState('');
  const [found, setFound] = useState('');
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState<Problem>(null);
  const [fieldError, setFieldError] = useState<FieldProblem>(null);
  const [refreshed, setRefreshed] = useState<Refreshed | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const setField = <K extends keyof LineFields>(key: K, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    if (fieldError?.field === key) setFieldError(null);
  };
  const errorFor = (field: string) => (fieldError?.field === field ? fieldError.message : undefined);
  const label = (key: string) => accountLabel(key, accounts);

  function showField(field: FieldProblem) {
    setFieldError(field);
    if (field) window.setTimeout(() => focusField(formRef.current, field.field), 0);
  }

  async function act(payload: Record<string, string>, doing: string, action: string) {
    setProblem(null);
    setBusy(doing);
    try {
      const result = await post<{ found?: Found; refresh?: Refreshed }>('phone-lines/', csrf, payload);
      if (payload.action !== 'discover') onChanged();
      return result;
    } catch (error) {
      setProblem({ action, error });
      showField(fieldProblem(error));
      return null;
    } finally {
      setBusy('');
    }
  }

  /** The form's gaps, marked at their field before anything is sent. */
  function missing(needAccount: boolean): FieldProblem {
    if (!(editing || form.number).trim()) return { field: 'number', message: 'Enter the phone number first, for example +441622958989.' };
    if (needAccount && !accounts.length) return { field: 'account', message: 'Add the Zoom account first (Zoom accounts, above).' };
    if (needAccount && !form.account) return { field: 'account', message: 'Choose the Zoom account this number is on.' };
    return null;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const gap = missing(true);
    if (gap) {
      setProblem(null);
      showField(gap);
      return;
    }
    if (await act({ ...form, action: editing ? 'update' : 'add', number: editing || form.number }, 'save',
      editing ? `Saving ${editing}` : 'Adding the number')) {
      setForm(emptyLine);
      setEditing('');
      setFound(editing ? `${editing} saved. Press Test to check it.` : `${form.number} added. Press Test to check it, then give it to a specialist below.`);
      setFieldError(null);
    }
  }

  /** Fill the account and Zoom identity from Zoom and from the calls Zoom has already sent for the number. */
  async function fill() {
    const gap = missing(false);
    if (gap) {
      showField(gap);
      return;
    }
    const result = await act({ action: 'discover', number: editing || form.number }, 'fill', 'Looking the number up in Zoom');
    const info = result?.found;
    if (!info) return;
    setForm(current => ({ ...current, account: info.account || current.account, zoom_email: info.zoom_email || current.zoom_email,
      zoom_user_id: info.zoom_user_id || current.zoom_user_id }));
    setFound(info.calls_90_days || info.zoom.found
      ? `Filled from ${info.zoom.found ? 'Zoom and ' : ''}${info.calls_90_days} ${info.calls_90_days === 1 ? 'call' : 'calls'} on this number in the last 90 days. Check, then save.`
      : `Zoom has sent no calls on this number yet${info.zoom.checked ? ', and it is not in any of the Zoom accounts' : ''}: choose the account yourself.`);
  }

  /** Put a number in the form (Edit, or Add for one already on a specialist's profile), show it, and point at what is left. */
  function load(fields: LineFields, number: string, message: string) {
    setEditing(number);
    setForm(fields);
    setProblem(null);
    setFound(message);
    const gap = !fields.account ? { field: 'account', message: accounts.length ? 'Choose the Zoom account this number is on.'
      : 'Add the Zoom account first (Zoom accounts, above).' } : null;
    setFieldError(gap);
    window.setTimeout(() => (gap ? focusField(formRef.current, gap.field) : formRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })), 0);
  }

  /** Re-read every number from Zoom (name, owner, account) and Test them all. */
  async function refresh() {
    setRefreshed(null);
    const result = await act({ action: 'refresh' }, 'refresh', 'Refreshing the numbers from Zoom');
    if (result?.refresh) setRefreshed(result.refresh);
  }

  const scopeMissing = data?.lines.some(line => line.test && !line.test.zoom.checked && line.test.zoom.problem.includes('scope'));
  const known = (key: string) => accounts.some(account => account.key === key);
  return (
    <>
      <div className="ec-head" style={{ marginTop: '1rem' }}>
        <div>
          <h3>Phone numbers</h3>
          <p className="ec-muted">Add every Zoom number the team calls from with its Zoom details, test it, then give each specialist one number
            (Edit on their profile below). A call on a number counts for the one specialist who has it, whatever email Zoom shows; a call
            made from the Zoom app directly is not counted, so always start calls with Call.</p>
        </div>
        <button type="button" disabled={!!busy || !data?.lines.length} title={data?.lines.length ? undefined : 'Add a number first'}
          onClick={() => void refresh()}>{busy === 'refresh' ? 'Refreshing from Zoom…' : 'Refresh from Zoom'}</button>
      </div>
      {refreshed && (
        <div className={`ec-alert ${refreshed.problems.length || refreshed.not_in_zoom.length ? '' : 'ec-success'}`} role="status">
          <strong>Refreshed {refreshed.numbers} {refreshed.numbers === 1 ? 'number' : 'numbers'} from Zoom and tested them all.</strong>
          {refreshed.changes.length ? <ul>{refreshed.changes.map(item => <li key={item}>{item}</li>)}</ul> : <p>Nothing had changed in Zoom.</p>}
          {!!refreshed.not_in_zoom.length && <p className="danger">Not in Zoom any more: {refreshed.not_in_zoom.join(', ')}. Remove them, or check them in Zoom.</p>}
          {refreshed.problems.map(item => <p key={item} className="danger">Could not read {item}</p>)}
          <button type="button" onClick={() => setRefreshed(null)}>Dismiss</button>
        </div>
      )}
      {!!data?.unlisted.length && (
        <p className="ec-alert">On a specialist’s profile but not in the list yet:{' '}
          {data.unlisted.map(item => (
            <span key={item.number}>{item.number} ({item.agents.map(agent => agent.name).join(', ')}){' '}
              <button type="button" onClick={() => load({ ...emptyLine, number: item.number,
                account: known(item.agents[0]?.account || '') ? item.agents[0].account : '' }, '',
              `${item.number} is filled in below. Check its Zoom account, press Fill from Zoom, then Add number.`)}>
                Add</button>{' '}</span>
          ))}
        </p>
      )}
      <ErrorNotice problem={problem} />
      <form ref={formRef} className="ec-form ed-line-form" noValidate onSubmit={event => void save(event)}>
        <h4 className="wide">{editing ? `Edit ${editing}` : 'Add a number'}</h4>
        {found && <p className="ec-alert ec-success wide" role="status">{found}</p>}
        <Field label="Phone number" error={errorFor('number')}
          hint="Zoom web portal (zoom.us, signed in as admin) → Phone System Management → Phone Numbers → Assigned. Include the country code: +44…">
          <input name="number" disabled={!!editing} placeholder="+441622958989" value={editing || form.number} aria-invalid={!!errorFor('number')}
            onChange={event => setField('number', event.target.value)} />
        </Field>
        <Field label="Label" hint="Your own name for the number, e.g. Student line 2.">
          <input name="label" placeholder="e.g. Student line 2" maxLength={80} value={form.label} onChange={event => setField('label', event.target.value)} />
        </Field>
        <Field label="Zoom account" error={errorFor('account')}
          hint={accounts.length ? 'The account whose Zoom web portal lists this number. Fill from Zoom finds it for you.' : 'Add the Zoom account first (Zoom accounts, above).'}>
          <select name="account" value={form.account} aria-invalid={!!errorFor('account')} onChange={event => setField('account', event.target.value)}>
            <option value="">{accounts.length ? 'Choose…' : 'No Zoom accounts yet'}</option>
            {accounts.map(account => <option key={account.key} value={account.key}>{account.label}</option>)}
          </select>
        </Field>
        <Field label="Zoom user email on its calls (if Zoom shows one)" error={errorFor('zoom_email')}
          hint="Press Fill from Zoom: it reads the email Zoom puts on this number’s calls. By hand: Zoom web portal → Phone System Management → Users & Rooms → the user who has this number. Leave empty if Zoom shows none.">
          <input name="zoom_email" type="email" placeholder="Filled from Zoom" value={form.zoom_email} aria-invalid={!!errorFor('zoom_email')}
            onChange={event => setField('zoom_email', event.target.value)} />
        </Field>
        <Field label="Zoom user ID on its calls (if Zoom shows one)" error={errorFor('zoom_user_id')}
          hint="Not shown in the Zoom portal: press Fill from Zoom, which reads it from the calls Zoom sent. Leave empty if it finds none.">
          <input name="zoom_user_id" placeholder="Filled from Zoom" value={form.zoom_user_id} aria-invalid={!!errorFor('zoom_user_id')}
            onChange={event => setField('zoom_user_id', event.target.value)} />
        </Field>
        <div className="ec-buttons wide">
          <button type="button" disabled={!!busy} onClick={() => void fill()}>{busy === 'fill' ? 'Looking in Zoom…' : 'Fill from Zoom'}</button>
          <button type="submit" className="primary" disabled={!!busy}>{busy === 'save' ? 'Saving…' : editing ? 'Save number' : 'Add number'}</button>
          {editing && <button type="button" disabled={!!busy} onClick={() => { setEditing(''); setForm(emptyLine); setFound(''); setFieldError(null); setProblem(null); }}>Cancel</button>}
        </div>
      </form>
      {scopeMissing && (
        <p className="ec-alert">Zoom did not let us look numbers up: the Zoom app needs the <code>{data?.scope}</code> scope (Zoom Marketplace, the app’s Scopes).
          Until then the Test and Fill from Zoom use the calls Zoom has already sent.</p>
      )}
      <div className="ec-table-wrap">
        <table>
          <thead><tr><th>Number</th><th>Zoom</th><th>Status</th><th>Specialist</th><th /></tr></thead>
          <tbody>
            {(data?.lines || []).map(line => (
              <tr key={line.number}>
                <td><strong>{line.number}</strong><small>{line.label}</small>
                  {line.refreshed_at && <small>In Zoom: {[line.zoom_name, line.zoom_owner && `owner ${line.zoom_owner}`].filter(Boolean).join(' · ') || 'no name'}
                    {' '}(read {when(line.refreshed_at)})</small>}</td>
                <td>{line.account && known(line.account) ? label(line.account)
                  : <span className="danger">{line.account ? `Account ${line.account} is not in Zoom accounts: Edit` : 'Account not set'}</span>}
                  {line.zoom_email && <small>{line.zoom_email}</small>}{line.zoom_user_id && <small>ID {line.zoom_user_id}</small>}</td>
                <td>
                  <span className={`ec-tag ${line.test ? STATUS_TONE[line.test.status] || '' : 'amber'}`}>{line.test ? line.test.label : 'Not tested'}</span>
                  {line.test?.warnings?.map(warning => <small key={warning} className="danger">{warning}</small>)}
                  {line.test && <small>{testDetail(line.test)} Tested {when(line.test.tested_at)}.</small>}
                </td>
                <td>{line.agents.length ? line.agents.map(agent => `${agent.name}${agent.active ? '' : ' (switched off)'}`).join(', ') : 'Nobody yet'}</td>
                <td>
                  <div className="ec-buttons">
                    <button type="button" disabled={!!busy} onClick={() => void act({ action: 'test', number: line.number }, line.number, `Testing ${line.number}`)}>{busy === line.number ? 'Testing…' : 'Test'}</button>
                    <button type="button" disabled={!!busy} onClick={() => load({ number: line.number, label: line.label, account: known(line.account) ? line.account : '',
                      zoom_email: line.zoom_email || '', zoom_user_id: line.zoom_user_id || '' }, line.number, '')}>Edit</button>
                    <button type="button" disabled={!!busy} onClick={() => void act({ action: 'remove', number: line.number }, 'remove', `Removing ${line.number}`)}>Remove</button>
                  </div>
                </td>
              </tr>
            ))}
            {data && !data.lines.length && <tr><td colSpan={5}>No numbers yet. Add the first one above.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** The Zoom accounts, their phone numbers and the specialists who use them, kept in step: an edit to any reloads all. */
function NumbersAndAgents({ csrf }: { csrf: string }) {
  const [lines, setLines] = useState<Lines | null>(null);
  const [accounts, setAccounts] = useState<ZoomAccounts | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    api<ZoomAccounts>('zoom-accounts/').then(setAccounts).catch(error => setProblem({ action: 'Loading the Zoom accounts', error }));
    api<Lines>('phone-lines/').then(setLines).catch(error => {
      setLines({ lines: [], unlisted: [], scope: '' });
      setProblem({ action: 'Loading the phone numbers', error });
    });
  }, [revision]);
  const changed = () => setRevision(value => value + 1);
  return <>
    <ErrorNotice problem={problem} />
    <ZoomAccountsSection csrf={csrf} data={accounts} onChanged={changed} />
    <PhoneLines csrf={csrf} data={lines} accounts={accounts?.accounts || []} onChanged={changed} />
    <Agents csrf={csrf} lines={lines?.lines || []} accounts={accounts?.accounts || []} revision={revision} onChanged={changed} />
  </>;
}

function Agents({ csrf, lines, accounts: zoomAccounts, revision: linesRevision, onChanged }: {
  csrf: string; lines: Line[]; accounts: ZoomAccount[]; revision: number; onChanged: () => void;
}) {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [accounts, setAccounts] = useState<{ id: number; email: string; name: string }[]>([]);
  const [editing, setEditing] = useState<AgentProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [problem, setProblem] = useState<Problem>(null);
  const [fieldError, setFieldError] = useState<FieldProblem>(null);
  const [revision, setRevision] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const errorFor = (field: string) => (fieldError?.field === field ? fieldError.message : undefined);

  useEffect(() => {
    api<{ agents: AgentProfile[]; accounts: { id: number; email: string; name: string }[] }>('agents/')
      .then(data => { setAgents(data.agents); setAccounts(data.accounts); })
      .catch(error => setProblem({ action: 'Loading the specialists', error }));
  }, [revision, linesRevision]);

  function start(profile: Form, agent: AgentProfile | null) {
    setForm(profile);
    setEditing(agent);
    setProblem(null);
    setFieldError(null);
    setOpen(true);
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    if (fieldError?.field === key) setFieldError(null);
  };
  const chosenLine = lines.find(line => line.number === form.zoom_phone_number);
  async function save(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    const gap = !editing && !form.user_id ? { field: 'user_id', message: 'Choose the sign-in account.' }
      : !form.display_name.trim() ? { field: 'display_name', message: 'Enter a display name.' }
        : !form.zoom_email.trim() ? { field: 'zoom_email', message: 'Enter the sign-in email.' } : null;
    if (gap) {
      setFieldError(gap);
      focusField(formRef.current, gap.field);
      return;
    }
    try {
      if (editing) await post(`agents/${editing.id}/`, csrf, form, 'PATCH');
      else await post('agents/', csrf, form);
      setOpen(false);
      setRevision(value => value + 1);
      onChanged();
    } catch (error) {
      setProblem({ action: editing ? `Saving ${editing.display_name}` : 'Adding the specialist', error });
      const field = fieldProblem(error);
      setFieldError(field);
      if (field) focusField(formRef.current, field.field);
    }
  }

  return (
    <>
      <div className="ec-head" style={{ marginTop: '1rem' }}>
        <h3>Specialist profiles</h3>
        <button type="button" onClick={() => start(emptyForm, null)}>+ Add specialist</button>
      </div>
      {!open && <ErrorNotice problem={problem} />}
      <div className="ec-table-wrap">
        <table>
          <thead><tr><th>Specialist</th><th>Zoom account</th><th>Phone number</th><th>Daily target</th><th /></tr></thead>
          <tbody>
            {agents.map(agent => (
              <tr key={agent.id}>
                <td>{agent.display_name}<small>{agent.user_email}</small></td>
                <td>{agent.zoom_email}<small>{accountLabel(agent.zoom_account, zoomAccounts)}</small></td>
                <td>{agent.zoom_phone_number || 'Not recorded'}</td>
                <td>{agent.daily_talk_target_minutes} minutes<small>{agent.active ? 'Active' : 'Inactive'}</small></td>
                <td><button type="button" onClick={() => { const { id: _id, user_email: _email, ...rest } = agent; start(rest, agent); }}>Edit</button></td>
              </tr>
            ))}
            {!agents.length && <tr><td colSpan={5}>No specialist profiles yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <h2>{editing ? `Edit ${editing.display_name}` : 'Add a specialist'}</h2>
        {open && <ErrorNotice problem={problem} />}
        <form ref={formRef} className="ec-form" noValidate onSubmit={save}>
          {!editing && (
            <Field label="Sign-in account" wide error={errorFor('user_id')}>
              <select name="user_id" value={form.user_id || ''} aria-invalid={!!errorFor('user_id')} onChange={event => set('user_id', Number(event.target.value))}>
                <option value="">Choose an account</option>
                {accounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.email})</option>)}
              </select>
            </Field>
          )}
          <Field label="Display name" error={errorFor('display_name')}>
            <input name="display_name" value={form.display_name} aria-invalid={!!errorFor('display_name')} onChange={event => set('display_name', event.target.value)} />
          </Field>
          <Field label={`Zoom account${chosenLine?.account ? ' (from the phone number)' : ''}`} error={errorFor('zoom_account')}
            hint={chosenLine?.account ? 'Set by the phone number’s account.' : zoomAccounts.length ? undefined : 'Add the Zoom account first (Zoom accounts).'}>
            <select name="zoom_account" value={chosenLine?.account || form.zoom_account} disabled={!!chosenLine?.account} aria-invalid={!!errorFor('zoom_account')}
              onChange={event => set('zoom_account', event.target.value)}>
              <option value="">Choose…</option>
              {zoomAccounts.map(account => <option key={account.key} value={account.key}>{account.label}</option>)}
              {form.zoom_account && !zoomAccounts.some(account => account.key === form.zoom_account) && (
                <option value={form.zoom_account}>{form.zoom_account} (not in Zoom accounts)</option>
              )}
            </select>
          </Field>
          <Field label="Sign-in email for Zoom matching" error={errorFor('zoom_email')} hint="Only used for calls not on a listed phone number.">
            <input name="zoom_email" type="email" value={form.zoom_email} aria-invalid={!!errorFor('zoom_email')} onChange={event => set('zoom_email', event.target.value)} />
          </Field>
          <Field label="Phone number" error={errorFor('zoom_phone_number')} hint="From the Phone numbers list above.">
            <select name="zoom_phone_number" value={form.zoom_phone_number} aria-invalid={!!errorFor('zoom_phone_number')} onChange={event => set('zoom_phone_number', event.target.value)}>
              <option value="">No number</option>
              {lines.map(line => {
                const taken = line.agents.find(agent => agent.active && agent.id !== editing?.id);
                return <option key={line.number} value={line.number} disabled={!!taken}>
                  {line.number}{line.label ? ` · ${line.label}` : ''}{taken ? ` (${taken.name} has it)` : ''}</option>;
              })}
              {form.zoom_phone_number && !lines.some(line => line.number === form.zoom_phone_number) && (
                <option value={form.zoom_phone_number}>{form.zoom_phone_number} (not in the list)</option>
              )}
            </select>
          </Field>
          <label>Daily talk target (minutes)<input type="number" min={0} value={form.daily_talk_target_minutes} onChange={event => set('daily_talk_target_minutes', Number(event.target.value))} /></label>
          <label className="wide ec-checks"><input type="checkbox" checked={form.active} onChange={event => set('active', event.target.checked)} /> Active specialist</label>
          <button type="submit" className="primary">Save specialist</button>
        </form>
      </Dialog>
    </>
  );
}

function Activity() {
  const [month, setMonth] = useState('');
  const log = useCallCentre<ActivityLog>(`activity-log/${month ? `?month=${month}` : ''}`);
  const data = log.data;
  const totals = (data?.daily || []).reduce((sum, day) => ({ calls: sum.calls + day.calls, answered: sum.answered + day.answered, missed: sum.missed + day.not_answered }), { calls: 0, answered: 0, missed: 0 });
  const max = Math.max(1, ...(data?.daily || []).map(day => day.calls));
  const width = Math.max(1, data?.daily.length || 1);
  return (
    <section className="ec-card" style={{ marginTop: '1rem' }}>
      <div className="ec-head">
        <div><h2>Learner call activity</h2><p className="ec-muted">Outbound Zoom calls matched to learners by phone number.</p></div>
        <label>Month
          <select value={data?.month || month} onChange={event => setMonth(event.target.value)}>
            {(data?.months || []).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      {log.error && <p className="ec-status danger" role="alert">{log.error}</p>}
      <div className="ec-grid">
        <div><strong>{totals.calls}</strong><p>Calls</p></div>
        <div><strong>{totals.answered}</strong><p>Answered</p></div>
        <div><strong>{totals.missed}</strong><p>Not answered</p></div>
      </div>
      {!!data?.daily.length && (
        <svg className="ec-chart" viewBox="0 0 720 190" role="img" aria-label="Calls by day, answered and not answered">
          <line x1="35" y1="160" x2="695" y2="160" stroke="#d9d6e1" />
          {data.daily.map((day, index) => {
            const slot = 655 / width;
            const x = 40 + index * slot;
            const answered = (day.answered / max) * 135;
            const missed = (day.not_answered / max) * 135;
            return (
              <g key={day.date}>
                <rect x={x} y={160 - answered} width={Math.max(2, slot * 0.6)} height={answered} fill="#60359a"><title>{day.date}: {day.answered} answered</title></rect>
                <rect x={x} y={160 - answered - missed} width={Math.max(2, slot * 0.6)} height={missed} fill="#c99b40"><title>{day.date}: {day.not_answered} not answered</title></rect>
              </g>
            );
          })}
          <text x="35" y="183">{data.daily[0].date}</text>
          <text x="610" y="183">{data.daily[data.daily.length - 1].date}</text>
        </svg>
      )}
      <div className="ec-legend"><span style={{ '--colour': '#60359a' } as React.CSSProperties}>Answered</span><span style={{ '--colour': '#c99b40' } as React.CSSProperties}>Not answered</span></div>
      <details>
        <summary>Recent learner calls ({data?.total_calls ?? 0})</summary>
        <div className="ec-table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Learner</th><th>Coach</th><th>Number</th><th>Result</th></tr></thead>
            <tbody>
              {data?.recent_calls.map(row => (
                <tr key={row.id}><td>{row.date}</td><td>{row.learner_name || 'Unknown learner'}<small>{row.learner_email}</small></td><td>{row.coach || '—'}</td><td>{row.phone}</td><td><span className={`ec-tag ${row.answered ? 'green' : 'amber'}`}>{row.answered ? 'Answered' : 'Not answered'}</span></td></tr>
              ))}
              {!data?.recent_calls.length && <tr><td colSpan={5}>{log.loading ? 'Loading…' : 'No learner calls this month.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

/** Zoom Phone: account health, specialists, call evidence with recordings and transcripts, and learner call activity. */
export default function ZoomPhone({ overview, csrf, isManager }: { overview: Overview; csrf: string; isManager: boolean }) {
  const [filters, setFilters] = useState(() => {
    const today = londonDay();
    return { from: `${today.slice(0, 7)}-01`, to: today, account: 'all', direction: 'outbound', page: 1 };
  });
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [recording, setRecording] = useState<number | null>(null);
  const [transcripts, setTranscripts] = useState(false);
  const change = (key: string, value: string) => setFilters(current => ({ ...current, [key]: value, page: 1 }));

  const load = useCallback(async (signal: AbortSignal) => {
    if (!filters.from || !filters.to || filters.from > filters.to) {
      setError('Choose a valid date range.');
      return;
    }
    setLoading(true);
    try {
      const data = await request<Report>(`/api/zoom/calls/?${new URLSearchParams({ ...filters, page: String(filters.page) })}`, { signal });
      setReport(data);
      setError('');
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : 'Call reports are unavailable.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, revision]);

  const connected = !!report?.accounts.some(account => account.configured && account.last_success_at && !account.error);
  const lastSync = report?.accounts.map(account => account.last_success_at).filter(Boolean).sort().pop() || null;
  const lastRecordings = report?.accounts.map(account => account.recordings_last_success_at).filter(Boolean).sort().pop() || null;

  return (
    <>
      <section className="ec-card">
        <div className="ec-head">
          <div><div className="ec-eyebrow">Engagement calls</div><h2>Zoom Phone</h2><p>Call from the learner’s record. Search saved call evidence, read transcripts and review call time here.</p></div>
          <span className={`ec-tag ${connected ? 'green' : 'amber'}`}>{connected ? 'Zoom connected' : 'Zoom setup needed'}</span>
        </div>
        {error && <p className="ec-status danger" role="alert">{error}</p>}
        <div className="ec-grid">
          <div><strong>{report?.totals.calls ?? '…'}</strong><p>Calls in this range</p></div>
          <div><strong>{report?.totals.answered ?? '…'}</strong><p>Answered calls</p></div>
          <div><strong>{report ? hoursText(report.totals.answered_duration_seconds) : '…'}</strong><p>Connected hours</p></div>
          <div><strong>{report?.totals.not_answered ?? '…'}</strong><p>Not answered</p></div>
        </div>
        <p className="ec-muted">Last Zoom import: {when(lastSync)} · Last recordings import: {when(lastRecordings)}</p>
        <div className="ec-table-wrap">
          <table>
            <thead><tr><th>Specialist</th><th>Zoom account</th><th>Phone number</th><th>Identity</th></tr></thead>
            <tbody>
              {overview.agents.map(agent => (
                <tr key={agent.id}>
                  <td>{agent.display_name}</td>
                  <td>{accountLabel(agent.zoom_account, report?.accounts)}</td>
                  <td>{agent.zoom_phone_number || 'Not recorded'}</td>
                  <td>{agent.sync.error ? agent.sync.error : agent.sync.last_success_at ? 'Verified with Zoom' : 'Awaiting first sync'}</td>
                </tr>
              ))}
              {!overview.agents.length && <tr><td colSpan={4}>No active specialist profiles.</td></tr>}
            </tbody>
          </table>
        </div>
        {isManager && <NumbersAndAgents csrf={csrf} />}
      </section>

      <section className="ec-card" style={{ marginTop: '1rem' }}>
        <h2>1. Zoom accounts</h2>
        <p>The Zoom accounts added above (Zoom accounts), with their sync. The worker imports call logs and recordings every cycle.</p>
        <div className="ec-table-wrap">
          <table>
            <thead><tr><th>Account</th><th>Status</th><th>Calls</th><th>Call hours</th><th>Last sync</th></tr></thead>
            <tbody>
              {report?.accounts.map(account => (
                <tr key={account.key}>
                  <td>{account.label}</td>
                  <td>
                    <span className={`ec-tag ${!account.configured || account.error ? 'amber' : account.last_success_at ? 'green' : ''}`}>
                      {!account.configured ? 'Setup needed' : account.syncing ? 'Syncing' : account.error ? 'Sync failed' : account.last_success_at ? 'Connected' : 'Awaiting sync'}
                    </span>
                    {account.error && <small>{account.error}</small>}
                    {!!account.missing_settings?.length && <small>Missing: {account.missing_settings.join(', ')}</small>}
                    {account.recordings_error && <small>Recordings: {account.recordings_error}</small>}
                  </td>
                  <td>{account.calls}</td>
                  <td>{hoursText(account.duration_seconds)}<small>{hoursText(account.answered_duration_seconds)} connected</small></td>
                  <td>{when(account.last_success_at)}</td>
                </tr>
              ))}
              {report && !report.accounts.length && <tr><td colSpan={5}>No Zoom accounts yet: add them above.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ec-card" style={{ marginTop: '1rem' }}>
        <h2>2. Save evidence</h2>
        <p>Only calls started from this system appear in reports and have their recordings transcribed and analysed. Transcript text is searchable by managers; each specialist can read their own calls.</p>
        <p className="ec-muted">An archive copy in private Azure storage is not connected yet; recordings stay in Zoom under its retention policy.</p>
      </section>

      <section className="ec-card" style={{ marginTop: '1rem' }}>
        <h2>3. Enable the call buttons</h2>
        <p>The Call button opens the Zoom desktop app with the learner’s number and the specialist’s engagement caller ID. Each specialist keeps the Zoom desktop app signed in with their college account.</p>
        <p className="ec-muted">Outcomes are recorded once Zoom reports the call.</p>
      </section>

      <section className="ec-card" style={{ marginTop: '1rem' }}>
        <div className="ec-head">
          <div><h2>Call evidence</h2><p>{report ? `${report.total_records} calls in this range.` : 'Loading calls…'}</p></div>
          <div className="ec-buttons">
            {isManager && <button type="button" onClick={() => setTranscripts(true)}>All transcripts</button>}
            <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh</button>
          </div>
        </div>
        <div className="ec-tools">
          <label>From <input type="date" value={filters.from} onChange={event => change('from', event.target.value)} /></label>
          <label>To <input type="date" value={filters.to} onChange={event => change('to', event.target.value)} /></label>
          <select aria-label="Zoom account" value={filters.account} onChange={event => change('account', event.target.value)}>
            <option value="all">All accounts</option>
            {report?.accounts.map(account => <option key={account.key} value={account.key}>{account.label}</option>)}
          </select>
          <select aria-label="Call direction" value={filters.direction} onChange={event => change('direction', event.target.value)}>
            <option value="outbound">Outgoing calls</option><option value="inbound">Incoming calls</option><option value="all">All directions</option>
          </select>
        </div>
        <p className="ec-muted">Times are in {report?.timezone || 'Europe/London'}. A call is linked to a learner only when the number matches the learner or line-manager directory. Recording length does not count as verified talk time.</p>
        <div className="ec-table-wrap">
          <table>
            <thead><tr><th>Called</th><th>Account</th><th>Contact</th><th>Result</th><th>Evidence</th></tr></thead>
            <tbody>
              {report?.calls.map(call => {
                const person = contact(call);
                return (
                  <tr key={call.id}>
                    <td>{when(call.started_at)}<small>{seconds(call.duration_seconds)}</small></td>
                    <td>{accountLabel(call.source_account, report?.accounts)}<small>{call.direction === 'outbound' ? `From ${call.caller_name || call.caller_email || call.caller_number}` : `To ${call.callee_name || call.callee_number}`}</small></td>
                    <td>{person.name}<small>{person.role} · {person.number || 'Unknown'}</small></td>
                    <td><span className={`ec-tag ${call.result === 'answered' ? 'green' : 'amber'}`}>{human(call.result) || call.raw_result || 'Other'}</span></td>
                    <td><button type="button" onClick={() => setRecording(call.id)}>Read transcript</button></td>
                  </tr>
                );
              })}
              {!report?.calls.length && <tr><td colSpan={5}><p className="ec-empty">{loading ? 'Loading calls…' : 'No matching calls in this range.'}</p></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="ec-buttons">
          <button type="button" disabled={loading || filters.page === 1} onClick={() => setFilters(current => ({ ...current, page: current.page - 1 }))}>Previous page</button>
          <span>Page {filters.page}</span>
          <button type="button" disabled={loading || !report?.has_next} onClick={() => setFilters(current => ({ ...current, page: current.page + 1 }))}>Next page</button>
        </div>
        {!!report?.totals.missing_duration && <p className="ec-alert">Duration unavailable for {report.totals.missing_duration} calls; hours are incomplete.</p>}
      </section>

      <Activity />
      <RecordingDialog callId={recording} onClose={() => setRecording(null)} />
      {isManager && <TranscriptsDialog open={transcripts} onClose={() => setTranscripts(false)} from={filters.from} to={filters.to} />}
    </>
  );
}
