import { useRef, useState } from 'react';
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
};
export type ZoomAccounts = { accounts: ZoomAccount[]; secrets_problem: string; secret_setting: string };
type AccountFields = { label: string; account_id: string; client_id: string; client_secret: string };

const empty: AccountFields = { label: '', account_id: '', client_id: '', client_secret: '' };
const TEST_TAG = { working: ['green', 'Working'], partial: ['amber', 'Partly working'], failed: ['red', 'Cannot sign in'] } as const;
const CREDENTIALS_HINT = 'Zoom App Marketplace (marketplace.zoom.us) → Manage → your Server-to-Server OAuth app → App Credentials.';

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

/** The Zoom accounts calls are read from: add each one's app credentials, then Test it. The secret is stored encrypted
 * on the server and never shown again. */
export default function ZoomAccountsSection({ csrf, data, onChanged }: { csrf: string; data: ZoomAccounts | null; onChanged: () => void }) {
  const [form, setForm] = useState<AccountFields>(empty);
  const [editing, setEditing] = useState<ZoomAccount | null>(null);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState<Problem>(null);
  const [fieldError, setFieldError] = useState<FieldProblem>(null);
  const [notice, setNotice] = useState('');
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
    setForm({ label: account.label, account_id: account.account_id, client_id: account.client_id, client_secret: '' });
    setProblem(null);
    setNotice('');
    showField(field);
    if (!field) window.setTimeout(() => formRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
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
                      : 'The server cannot read the secret: Edit and enter it again'}</small></td>
                <td>{account.test ? <TestResult test={account.test} /> : <span className="ec-tag amber">Not tested</span>}</td>
                <td>
                  <div className="ec-buttons">
                    <button type="button" disabled={!!busy} onClick={() => void test(account)}>{busy === account.key ? 'Testing…' : 'Test'}</button>
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
        <div className="ec-buttons wide">
          <button type="submit" className="primary" disabled={!!busy}>{busy === 'save' ? 'Saving…' : editing ? 'Save account' : 'Add account'}</button>
          {editing && <button type="button" disabled={!!busy} onClick={() => { setEditing(null); setForm(empty); setFieldError(null); setProblem(null); }}>Cancel</button>}
        </div>
      </form>
    </>
  );
}
