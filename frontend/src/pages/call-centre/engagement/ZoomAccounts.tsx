import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { post } from '../api';
import ErrorNotice, { Field } from './ErrorNotice';
import { fieldProblem, focusField } from './formErrors';
import type { FieldProblem, Problem } from './formErrors';
import { when } from './model';

type Check = { name: string; label: string; ok: boolean; used_for: string; message: string; scopes?: string[] };
type AccountTest = { status: 'working' | 'partial' | 'failed'; tested_at: string; problem: { field: string; message: string } | null; checks: Check[] };
export type ZoomAccount = {
  key: string; label: string; account_id: string; client_id: string; secret_saved: boolean; secret_end: string; secret_readable: boolean;
  added_by: string; added_at: string | null; test: AccountTest | null;
  webhook_saved: boolean; webhook_end: string; webhook_readable: boolean; webhook: WebhookState;
};
type WebhookState = { event?: string; at?: string; validated_at?: string; rejected?: string; rejected_at?: string | null };
export type ZoomAccounts = { accounts: ZoomAccount[]; secrets_problem: string; secret_setting: string };
type AccountFields = { label: string; account_id: string; client_id: string; client_secret: string; webhook_secret: string };
type ZoomNumber = {
  number: string; display_name: string; status: string; assignee: string; assignee_type: string; extension: string; site: string;
  capability: string[]; listed: boolean; listed_account: string; specialists: string[];
  recording: { state: 'on' | 'off' | 'unknown' | 'not_user'; calls: string; transcription: boolean | null; reason: string };
};
const OWNER_TYPES: Record<string, string> = { user: 'User', callQueue: 'Call queue', autoReceptionist: 'Auto receptionist', commonArea: 'Common area',
  sharedLineGroup: 'Shared line group' };

const empty: AccountFields = { label: '', account_id: '', client_id: '', client_secret: '', webhook_secret: '' };
const TEST_TAG = { working: ['green', 'Working'], partial: ['amber', 'Partly working'], failed: ['red', 'Cannot sign in'] } as const;
const CREDENTIALS_HINT = 'Zoom App Marketplace (marketplace.zoom.us) → Manage → your Server-to-Server OAuth app → App Credentials.';
const webhookUrl = (key: string) => `${window.location.origin}/api/zoom-webhook/${key}/`;

/** Zoom's webhooks for one account: the URL to give Zoom, and what the last request did. */
function Webhook({ account }: { account: ZoomAccount }) {
  if (!account.webhook_saved) return <small className="ec-muted">Webhooks off: calls arrive at the next cycle (Edit to add the Secret Token).</small>;
  const webhook = account.webhook || {};
  const lastRejected = webhook.rejected && webhook.rejected_at && (!webhook.at || webhook.rejected_at > webhook.at);
  return (
    <>
      <small>Webhook URL <code>{webhookUrl(account.key)}</code></small>
      {!account.webhook_readable && <small className="danger">The server cannot read the Secret Token: Edit and enter it again.</small>}
      {lastRejected && <small className="danger">Last request refused {when(webhook.rejected_at!)}: {webhook.rejected}</small>}
      {webhook.at ? <small>Last event {when(webhook.at)} ({webhook.event})</small>
        : webhook.validated_at ? <small>URL validated by Zoom {when(webhook.validated_at)}; no event yet.</small>
          : <small className="ec-muted">Waiting for Zoom: paste the URL in the app’s Event Subscriptions and press Validate.</small>}
    </>
  );
}

/** How to turn Zoom's webhooks on for an account. */
function WebhookHelp({ accountKey }: { accountKey: string }) {
  return (
    <details className="ed-zoom-help wide">
      <summary>Webhooks (optional): calls reach the cases within a minute</summary>
      <ol>
        <li>In the same app on marketplace.zoom.us, open <strong>Features</strong> (Access). Copy the <strong>Secret Token</strong> into
          the field below and save.</li>
        <li>Turn on <strong>Event Subscriptions</strong> → <strong>Add Event Subscription</strong>. Give it a name, and paste the
          endpoint URL <code>{webhookUrl(accountKey || '<account key>')}</code>{!accountKey && ' (the key shows on the account once it is added)'}.</li>
        <li>Press <strong>Validate</strong>: Zoom checks the URL against the Secret Token. The account’s row then says it was validated.</li>
        <li>Under <strong>Add Events</strong> → <strong>Phone</strong>, tick the events for a call that ended or whose call log is completed
          (caller side), then <strong>Save</strong>. Without webhooks nothing breaks: calls arrive at the next cycle.</li>
      </ol>
    </details>
  );
}

/** Where each value comes from in Zoom, step by step. */
function WhereToFind() {
  return (
    <details className="ed-zoom-help">
      <summary>Where do I find these in Zoom?</summary>
      <ol>
        <li>Sign in at <strong>marketplace.zoom.us</strong> as an admin of the Zoom account (each Zoom account needs its own app).</li>
        <li>Open <strong>Manage</strong> and choose the account’s <strong>Server-to-Server OAuth</strong> app. No app yet: <strong>Develop → Build App →
          Server-to-Server OAuth app</strong>, and give it a name.</li>
        <li>On <strong>App Credentials</strong>, copy the <strong>Account ID</strong>, <strong>Client ID</strong> and <strong>Client Secret</strong> into this form.</li>
        <li>On <strong>Scopes</strong>, add read access to Phone <strong>call history</strong>, <strong>recordings</strong> (and recording
          transcripts) and <strong>phone numbers</strong>. If one is missing, the Test below names the exact scope to add.</li>
        <li>On <strong>Activation</strong>, activate the app. Then save here and press <strong>Test</strong>.</li>
      </ol>
    </details>
  );
}

function TestResult({ test }: { test: AccountTest }) {
  const [tone, label] = TEST_TAG[test.status];
  return (
    <>
      <span className={`ec-tag ${tone}`}>{label}</span>
      {test.problem && <small className="danger">{test.problem.message}</small>}
      {test.checks.map(check => (
        <small key={check.name} className={check.ok ? '' : 'danger'}>
          {check.ok ? '✓' : '✗'} {check.label} ({check.used_for}){check.ok ? '' : `: ${check.message}`}</small>
      ))}
      <small>Tested {when(test.tested_at)}</small>
    </>
  );
}

/** A number's automatic call recording, from its owner's Zoom phone policy. Off means no transcript and no AI review. */
function Recording({ item }: { item: ZoomNumber }) {
  const { recording } = item;
  if (recording.state === 'on') {
    return <><span className="ec-tag green">On · {recording.calls || 'calls'}</span>
      {recording.transcription !== null && <small>{recording.transcription ? 'Zoom transcribes them' : 'Zoom does not transcribe them'}</small>}</>;
  }
  if (recording.state === 'off') {
    return <><span className="ec-tag red">Off</span>
      <small className="danger">{item.specialists.length ? `No transcripts or AI reviews for ${item.specialists.join(', ')}’s calls. `
        : 'Calls on it get no transcript or AI review. '}Turn it on in Zoom: the owner’s Policy → Automatic Call Recording.</small></>;
  }
  if (recording.state === 'unknown') return <><span className="ec-tag amber">Unknown</span><small>{recording.reason}</small></>;
  return <small className="ec-muted">{recording.reason}</small>;
}

/** Every number on one Zoom account, as Zoom lists it: who has it in Zoom, and whether it is in our list (Add puts it
 * there with this account). Read-only towards Zoom. */
function AccountNumbers({ csrf, account, accounts, onChanged, onClose }: {
  csrf: string; account: ZoomAccount; accounts: ZoomAccount[]; onChanged: () => void; onClose: () => void;
}) {
  const [numbers, setNumbers] = useState<ZoomNumber[] | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [busy, setBusy] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    post<{ numbers: ZoomNumber[] }>('zoom-accounts/', csrf, { action: 'numbers', key: account.key })
      .then(data => setNumbers(data.numbers))
      .catch(error => setProblem({ action: `Listing the numbers on ${account.label}`, error }));
  }, [csrf, account.key, account.label]);

  async function add(items: ZoomNumber[]) {
    setProblem(null);
    for (const item of items) {
      setBusy(item.number);
      try {
        await post('phone-lines/', csrf, { action: 'add', number: item.number, account: account.key, label: item.display_name || item.assignee, from_zoom: 'true' });
        setNumbers(current => (current || []).map(row => (row.number === item.number ? { ...row, listed: true, listed_account: account.key } : row)));
      } catch (error) {
        setProblem({ action: `Adding ${item.number}`, error });
        break;
      }
    }
    setBusy('');
    onChanged();
  }

  const name = (key: string) => accounts.find(item => item.key === key)?.label || key;
  const shown = (numbers || []).filter(item => !search || `${item.number} ${item.display_name} ${item.assignee} ${item.site}`.toLowerCase().includes(search.toLowerCase()));
  const notListed = shown.filter(item => !item.listed);
  return (
    <section className="ed-zoom-numbers" aria-label={`Numbers on ${account.label}`}>
      <div className="ec-head">
        <div>
          <h4>Numbers on {account.label}{numbers ? ` (${numbers.length})` : ''}</h4>
          <p className="ec-muted">As Zoom lists them. Add puts a number in Phone numbers (below) on this account; then give it to a specialist.</p>
        </div>
        <div className="ec-buttons">
          {numbers && numbers.length > 8 && <input type="search" aria-label="Search numbers" placeholder="Search number, name or owner" value={search} onChange={event => setSearch(event.target.value)} />}
          {notListed.length > 1 && <button type="button" disabled={!!busy} onClick={() => void add(notListed)}>Add all {notListed.length} not listed</button>}
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
      <ErrorNotice problem={problem} />
      {!numbers && !problem && <p role="status">Asking Zoom for the numbers…</p>}
      {numbers && (
        <div className="ec-table-wrap">
          <table>
            <thead><tr><th>Number</th><th>Owner in Zoom</th><th>Status</th><th>Auto-recording</th><th>In our list</th><th /></tr></thead>
            <tbody>
              {shown.map(item => (
                <tr key={item.number}>
                  <td><strong>{item.number}</strong>{item.display_name && <small>{item.display_name}</small>}{item.site && <small>Site {item.site}</small>}</td>
                  <td>{item.assignee || <span className="ec-muted">Not assigned</span>}
                    {item.assignee && <small>{OWNER_TYPES[item.assignee_type] || item.assignee_type}{item.extension ? ` · ext. ${item.extension}` : ''}</small>}</td>
                  <td>{item.status || '—'}{!!item.capability.length && <small>{item.capability.join(', ')}</small>}</td>
                  <td><Recording item={item} /></td>
                  <td>{!item.listed ? <span className="ec-tag amber">Not listed</span>
                    : item.listed_account !== account.key
                      ? <span className="ec-tag red">Listed on {name(item.listed_account) || 'no account'}: Edit it below</span>
                      : <><span className="ec-tag green">Listed</span><small>{item.specialists.length ? item.specialists.join(', ') : 'No specialist yet'}</small></>}</td>
                  <td>{!item.listed && <button type="button" disabled={!!busy} onClick={() => void add([item])}>{busy === item.number ? 'Adding…' : 'Add'}</button>}</td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={6}>{numbers.length ? 'No number matches the search.' : 'Zoom lists no numbers on this account.'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** The Zoom accounts calls are read from: add each one's app credentials, then Test it. The secret is stored encrypted
 * on the server and never shown again. */
export default function ZoomAccountsSection({ csrf, data, onChanged }: { csrf: string; data: ZoomAccounts | null; onChanged: () => void }) {
  const [form, setForm] = useState<AccountFields>(empty);
  const [editing, setEditing] = useState<ZoomAccount | null>(null);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState<Problem>(null);
  const [fieldError, setFieldError] = useState<FieldProblem>(null);
  const [notice, setNotice] = useState('');
  const [listing, setListing] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const set = (key: keyof AccountFields, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    if (fieldError?.field === key) setFieldError(null);
  };
  const errorFor = (field: string) => (fieldError?.field === field ? fieldError.message : undefined);

  function showField(field: FieldProblem) {
    setFieldError(field);
    if (field) window.setTimeout(() => focusField(formRef.current, field.field), 0);
  }

  async function act(payload: Record<string, string>, doing: string, action: string) {
    setProblem(null);
    setNotice('');
    setBusy(doing);
    try {
      const result = await post<{ test?: AccountTest }>('zoom-accounts/', csrf, payload);
      onChanged();
      return result;
    } catch (error) {
      setProblem({ action, error });
      showField(fieldProblem(error));
      return null;
    } finally {
      setBusy('');
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    // Checked here first, so a gap is marked at its field straight away.
    const required: [keyof AccountFields, string][] = [['label', 'Enter a name for the account.'], ['account_id', 'Enter the Account ID.'],
      ['client_id', 'Enter the Client ID.']];
    if (!editing) required.push(['client_secret', 'Enter the Client Secret.']);
    const gap = required.find(([field]) => !form[field].trim());
    if (gap) {
      setProblem(null);
      showField({ field: gap[0], message: gap[1] });
      return;
    }
    const done = await act({ ...form, action: editing ? 'update' : 'add', key: editing?.key || '' }, 'save',
      editing ? `Saving ${editing.label}` : 'Adding the Zoom account');
    if (done) {
      setNotice(editing ? `${form.label} saved. Press Test to check it works.` : `${form.label} added. Press Test to check it works.`);
      setForm(empty);
      setEditing(null);
      setFieldError(null);
    }
  }

  function edit(account: ZoomAccount, field: FieldProblem = null) {
    setEditing(account);
    setForm({ label: account.label, account_id: account.account_id, client_id: account.client_id, client_secret: '', webhook_secret: '' });
    setProblem(null);
    setNotice('');
    showField(field);
    if (!field) window.setTimeout(() => formRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
  }

  async function removeWebhook(account: ZoomAccount) {
    const done = await act({ action: 'update', key: account.key, label: account.label, client_id: account.client_id, remove_webhook: 'true' },
      'save', `Turning webhooks off for ${account.label}`);
    if (done) {
      setNotice(`Webhooks are off for ${account.label}: delete the Event Subscription in the Zoom app too.`);
      setEditing(null);
      setForm(empty);
    }
  }

  async function test(account: ZoomAccount) {
    const result = await act({ action: 'test', key: account.key }, account.key, `Testing ${account.label}`);
    // A sign-in problem names the credential to fix: open it, marked.
    if (result?.test?.problem?.field) edit(account, { field: result.test.problem.field, message: result.test.problem.message });
  }

  return (
    <>
      <div className="ec-head" style={{ marginTop: '1rem' }}>
        <div>
          <h3>Zoom accounts</h3>
          <p className="ec-muted">Each Zoom account the team calls from, with its Server-to-Server OAuth app. Calls, recordings and transcripts
            are read from these accounts every cycle. The Client Secret is stored encrypted and is never shown again.</p>
        </div>
      </div>
      {data?.secrets_problem && (
        <div className="ec-alert" role="alert">
          <strong>The server cannot store Zoom secrets yet.</strong> {data.secrets_problem}
          <details>
            <summary>How to add {data.secret_setting}</summary>
            <ol>
              <li>On the server, in the <code>backend</code> folder, run:
                <pre>python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"</pre></li>
              <li>Add the line <code>{data.secret_setting}=</code> followed by the printed value to <code>backend/.env</code>. Keep it secret
                and never change it: a new key makes every saved Client Secret unreadable.</li>
              <li>Restart the backend and the call-centre worker, then reload this page.</li>
            </ol>
          </details>
        </div>
      )}
      <ErrorNotice problem={problem} />
      {notice && <p className="ec-alert ec-success" role="status">{notice}</p>}
      <div className="ec-table-wrap">
        <table>
          <thead><tr><th>Account</th><th>App</th><th>Status</th><th /></tr></thead>
          <tbody>
            {(data?.accounts || []).map(account => (
              <tr key={account.key}>
                <td><strong>{account.label}</strong><small>Key {account.key}</small></td>
                <td>Account ID {account.account_id}<small>Client ID {account.client_id}</small>
                  <small className={account.secret_readable ? '' : 'danger'}>
                    {!account.secret_saved ? 'No Client Secret' : account.secret_readable ? `Secret saved · ends …${account.secret_end}`
                      : 'The server cannot read the secret: Edit and enter it again'}</small>
                  <Webhook account={account} /></td>
                <td>{account.test ? <TestResult test={account.test} /> : <span className="ec-tag amber">Not tested</span>}</td>
                <td>
                  <div className="ec-buttons">
                    <button type="button" disabled={!!busy} onClick={() => void test(account)}>{busy === account.key ? 'Testing…' : 'Test'}</button>
                    <button type="button" aria-expanded={listing === account.key} onClick={() => setListing(current => (current === account.key ? '' : account.key))}>Numbers</button>
                    <button type="button" disabled={!!busy} onClick={() => edit(account)}>Edit</button>
                    <button type="button" disabled={!!busy}
                      onClick={() => void act({ action: 'remove', key: account.key }, 'remove', `Removing ${account.label}`)}>Remove</button>
                  </div>
                </td>
              </tr>
            ))}
            {data && !data.accounts.length && <tr><td colSpan={4}>No Zoom accounts yet: nothing is synced from Zoom. Add the first one below.</td></tr>}
          </tbody>
        </table>
      </div>
      {(data?.accounts || []).filter(account => account.key === listing).map(account => (
        <AccountNumbers key={account.key} csrf={csrf} account={account} accounts={data?.accounts || []} onChanged={onChanged} onClose={() => setListing('')} />
      ))}
      <form ref={formRef} className="ec-form ed-zoom-form" noValidate onSubmit={event => void save(event)}>
        <h4 className="wide">{editing ? `Edit ${editing.label}` : 'Add a Zoom account'}</h4>
        <WhereToFind />
        <Field label="Name" error={errorFor('label')} hint="Your own name for the account, e.g. Student or Office.">
          <input name="label" maxLength={60} value={form.label} aria-invalid={!!errorFor('label')} onChange={event => set('label', event.target.value)} />
        </Field>
        <Field label="Account ID" error={errorFor('account_id')}
          hint={editing ? 'Fixed: another Zoom account is added as a new account.' : CREDENTIALS_HINT}>
          <input name="account_id" autoComplete="off" disabled={!!editing} value={form.account_id} aria-invalid={!!errorFor('account_id')}
            onChange={event => set('account_id', event.target.value.trim())} />
        </Field>
        <Field label="Client ID" error={errorFor('client_id')} hint={CREDENTIALS_HINT}>
          <input name="client_id" autoComplete="off" value={form.client_id} aria-invalid={!!errorFor('client_id')} onChange={event => set('client_id', event.target.value.trim())} />
        </Field>
        <Field label="Client Secret" error={errorFor('client_secret')}
          hint={editing ? 'Leave empty to keep the saved secret.' : `${CREDENTIALS_HINT} Stored encrypted; never shown again.`}>
          <input name="client_secret" type="password" autoComplete="new-password" value={form.client_secret} aria-invalid={!!errorFor('client_secret')}
            placeholder={editing?.secret_saved ? `Saved · ends …${editing.secret_end}` : ''} onChange={event => set('client_secret', event.target.value.trim())} />
        </Field>
        <WebhookHelp accountKey={editing?.key || ''} />
        <Field label="Secret Token (webhooks, optional)" error={errorFor('webhook_secret')}
          hint={editing?.webhook_saved ? 'Leave empty to keep the saved token.' : 'The app’s Features page → Secret Token. Stored encrypted; never shown again.'}>
          <input name="webhook_secret" type="password" autoComplete="new-password" value={form.webhook_secret} aria-invalid={!!errorFor('webhook_secret')}
            placeholder={editing?.webhook_saved ? `Saved · ends …${editing.webhook_end}` : ''} onChange={event => set('webhook_secret', event.target.value.trim())} />
        </Field>
        <div className="ec-buttons wide">
          <button type="submit" className="primary" disabled={!!busy}>{busy === 'save' ? 'Saving…' : editing ? 'Save account' : 'Add account'}</button>
          {editing?.webhook_saved && <button type="button" disabled={!!busy} onClick={() => void removeWebhook(editing)}>Turn webhooks off</button>}
          {editing && <button type="button" disabled={!!busy} onClick={() => { setEditing(null); setForm(empty); setFieldError(null); setProblem(null); }}>Cancel</button>}
        </div>
      </form>
    </>
  );
}
