import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { accountLabel, api, londonDay, post, request, useCallCentre } from '../api';
import type { Overview } from '../api';
import Dialog from './Dialog';
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

const emptyForm: Form = { user_id: 0, display_name: '', zoom_email: '', zoom_user_id: '', zoom_phone_number: '', zoom_account: 'student', daily_talk_target_minutes: 180, active: true };
const roles: Record<string, string> = { learner: 'Learner', line_manager: 'Line manager' };
const seconds = (value: number | null) => (value === null ? 'Duration not supplied' : `${Math.floor(value / 60)}m ${value % 60}s`);
const hoursText = (value: number) => (value / 3600).toFixed(2);

function contact(call: Call) {
  const outbound = call.direction === 'outbound';
  const name = call.contact_name || (outbound ? call.callee_name : call.caller_name) || 'Unmatched number';
  return { name, role: roles[call.contact_role] || 'Unmatched number', number: outbound ? call.callee_number : call.caller_number };
}

function Agents({ csrf }: { csrf: string }) {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [accounts, setAccounts] = useState<{ id: number; email: string; name: string }[]>([]);
  const [editing, setEditing] = useState<AgentProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    api<{ agents: AgentProfile[]; accounts: { id: number; email: string; name: string }[] }>('agents/')
      .then(data => { setAgents(data.agents); setAccounts(data.accounts); })
      .catch(reason => setError(reason.message));
  }, [revision]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm(current => ({ ...current, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      if (editing) await post(`agents/${editing.id}/`, csrf, form, 'PATCH');
      else await post('agents/', csrf, form);
      setOpen(false);
      setRevision(value => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The agent could not be saved.');
    }
  }

  return (
    <>
      <div className="ec-head" style={{ marginTop: '1rem' }}>
        <h3>Specialist profiles</h3>
        <button type="button" onClick={() => { setForm(emptyForm); setEditing(null); setError(''); setOpen(true); }}>+ Add specialist</button>
      </div>
      {error && !open && <p className="ec-status danger" role="alert">{error}</p>}
      <div className="ec-table-wrap">
        <table>
          <thead><tr><th>Specialist</th><th>Zoom account</th><th>Engagement number</th><th>Daily target</th><th /></tr></thead>
          <tbody>
            {agents.map(agent => (
              <tr key={agent.id}>
                <td>{agent.display_name}<small>{agent.user_email}</small></td>
                <td>{agent.zoom_email}<small>{accountLabel(agent.zoom_account)}</small></td>
                <td>{agent.zoom_phone_number || 'Not recorded'}</td>
                <td>{agent.daily_talk_target_minutes} minutes<small>{agent.active ? 'Active' : 'Inactive'}</small></td>
                <td><button type="button" onClick={() => { const { id: _id, user_email: _email, ...rest } = agent; setForm(rest); setEditing(agent); setError(''); setOpen(true); }}>Edit</button></td>
              </tr>
            ))}
            {!agents.length && <tr><td colSpan={5}>No specialist profiles yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <h2>{editing ? `Edit ${editing.display_name}` : 'Add a specialist'}</h2>
        {error && <p className="ec-modal-error danger" role="alert">{error}</p>}
        <form className="ec-form" onSubmit={save}>
          {!editing && (
            <label className="wide">Sign-in account
              <select required value={form.user_id || ''} onChange={event => set('user_id', Number(event.target.value))}>
                <option value="">Choose an account</option>
                {accounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.email})</option>)}
              </select>
            </label>
          )}
          <label>Display name<input required value={form.display_name} onChange={event => set('display_name', event.target.value)} /></label>
          <label>Zoom account
            <select value={form.zoom_account} onChange={event => set('zoom_account', event.target.value)}>
              <option value="student">Student</option><option value="office">Office (Accountant)</option>
            </select>
          </label>
          <label>Zoom email<input type="email" required value={form.zoom_email} onChange={event => set('zoom_email', event.target.value)} /></label>
          <label>Zoom user ID (optional)<input value={form.zoom_user_id} onChange={event => set('zoom_user_id', event.target.value)} /></label>
          <label>Engagement number (+44…)<input value={form.zoom_phone_number} onChange={event => set('zoom_phone_number', event.target.value)} /></label>
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
export default function ZoomPhone({ overview, csrf, isManager, smartEmbed }: { overview: Overview; csrf: string; isManager: boolean; smartEmbed: boolean }) {
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
            <thead><tr><th>Specialist</th><th>Zoom account</th><th>Engagement number</th><th>Identity</th></tr></thead>
            <tbody>
              {overview.agents.map(agent => (
                <tr key={agent.id}>
                  <td>{agent.display_name}</td>
                  <td>{accountLabel(agent.zoom_account)}</td>
                  <td>{agent.zoom_phone_number || 'Not recorded'}</td>
                  <td>{agent.sync.error ? agent.sync.error : agent.sync.last_success_at ? 'Verified with Zoom' : 'Awaiting first sync'}</td>
                </tr>
              ))}
              {!overview.agents.length && <tr><td colSpan={4}>No active specialist profiles.</td></tr>}
            </tbody>
          </table>
        </div>
        {isManager && <Agents csrf={csrf} />}
      </section>

      <section className="ec-card" style={{ marginTop: '1rem' }}>
        <h2>1. Zoom accounts</h2>
        <p>Both Zoom Phone accounts are connected on the server with Server-to-Server OAuth credentials. The worker imports call logs and recordings every cycle.</p>
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
            </tbody>
          </table>
        </div>
      </section>

      <section className="ec-card" style={{ marginTop: '1rem' }}>
        <h2>2. Save evidence</h2>
        <p>Recordings and transcripts are imported from Zoom into the call-centre database. Transcript text is searchable by managers; each specialist can read the calls they made.</p>
        <p className="ec-muted">An archive copy in private Azure storage is not connected yet; recordings stay in Zoom under its retention policy.</p>
      </section>

      <section className="ec-card" style={{ marginTop: '1rem' }}>
        <h2>3. Enable the call buttons</h2>
        {smartEmbed ? <>
          <p>The Call button dials in the Zoom phone docked at the bottom right of the Engagement Centre (Zoom Phone Smart Embed), with the learner’s number and the specialist’s engagement caller ID. Each specialist signs in to that phone once with their college Zoom account; if it is not open, the Zoom desktop app is used instead.</p>
          <p className="ec-muted">When a call ends, the Engagement Centre asks Zoom for its call history straight away, so the call reaches the case within about a minute. The result still comes from Zoom’s records, not from the browser.</p>
        </> : <>
          <p>The Call button opens the Zoom desktop app with the learner’s number and the specialist’s engagement caller ID. Each specialist keeps the Zoom desktop app signed in with their college account.</p>
          <p className="ec-muted">In-page calling (Zoom Phone Smart Embed) is switched off on this server (CALLCENTRE_SMART_EMBED). Outcomes are recorded once Zoom reports the call.</p>
        </>}
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
            <option value="all">Both accounts</option><option value="student">Student</option><option value="office">Office (Accountant)</option>
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
                    <td>{accountLabel(call.source_account)}<small>{call.direction === 'outbound' ? `From ${call.caller_name || call.caller_email || call.caller_number}` : `To ${call.callee_name || call.callee_number}`}</small></td>
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
