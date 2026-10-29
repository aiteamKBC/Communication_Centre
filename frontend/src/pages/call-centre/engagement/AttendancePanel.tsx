import { useCallback, useEffect, useState } from 'react';
import { api, post } from '../api';
import type { Session } from './actions';
import { lectureDay, when } from './model';

type Status = 'present' | 'absent' | null;
type Action = 'present' | 'absent' | 'delete';
type Lecture = {
  ref: string; source: 'live' | 'kbc'; date: string; weekday: string; module: string; lecture: string;
  session_number: number | null; status: Status; corrected: boolean; missed: boolean; covering: boolean; can_delete: boolean;
};
type Edit = {
  id: number; record_ref: string; session_date: string | null; lecture: string; module: string; action: Action; action_label: string;
  reason: string; reason_label: string; note: string; state: string; error: string; actor: string; created_at: string;
  ai_state: string; ai_label: string; ai_evidence: string; undone_by: string; undone_at: string | null;
};
type AttendanceData = {
  records: Lecture[]; window: string[]; missed: string | null; covering: string | null; usual_weekday: string | null;
  summary: { present: number; absent: number; unmarked: number; rate: number | null };
  set_up: boolean; not_set_up: string; actions: Record<Action, string>; reasons: Record<string, string>; edits: Edit[];
};
type Change = { ref: string; action: Action };

const STATUS: Record<string, [string, string]> = { present: ['Attended', 'green'], absent: ['Absent', 'red'] };

/** Beside a missed-lecture case: the learner's lectures around the missed one (two before, two after), and the same
 * lecture they attended with another group, so the call starts from what the register shows ("we can see you attended
 * on Friday instead"). On the call the specialist corrects the register: mark a lecture attended or absent, or delete
 * it, with a reason. The change is made in the LMS too, and the AI checks it against the call's transcript. */
export default function AttendancePanel({ caseId, open, session, notify, onChanged }: {
  caseId: number; open: boolean; session: Session; notify: (message: string, error?: boolean) => void; onChanged: () => void;
}) {
  const [data, setData] = useState<AttendanceData | null>(null);
  const [error, setError] = useState('');
  const [all, setAll] = useState(false);
  const [change, setChange] = useState<Change | null>(null);
  const [reason, setReason] = useState('covering_lecture');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<AttendanceData>(`tickets/${caseId}/attendance/`)
      .then(result => { setData(result); setError(''); })
      .catch(failure => setError(failure instanceof Error ? failure.message : 'The attendance could not load.'));
  }, [caseId]);
  useEffect(load, [load]);

  const canEdit = !!data?.set_up && open && session.canAct && !session.preview;
  const byRef = new Map((data?.records || []).map(record => [record.ref, record]));
  const missed = data?.missed ? byRef.get(data.missed) : undefined;
  const covering = data?.covering ? byRef.get(data.covering) : undefined;
  const shown = data ? (all ? [...data.records].reverse() : data.window.map(ref => byRef.get(ref)!).filter(Boolean)) : [];

  // Every change in one request: the server makes them all in the LMS, or none of them.
  async function save(changes: Change[], why: string, text: string) {
    setBusy(true);
    setError('');
    try {
      setData(await post<AttendanceData>(`tickets/${caseId}/attendance/`, session.csrf,
        { changes, reason: why, note: text, agent_id: session.agentId }));
      notify(changes.length > 1 ? 'Register corrected in the LMS: both lectures changed.' : 'Register corrected in the LMS.');
      setChange(null);
      setNote('');
      onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The register could not be changed, so nothing was saved.');
    } finally {
      setBusy(false);
    }
  }

  function start(ref: string, action: Action) {
    setChange({ ref, action });
    setReason(covering && (ref === covering.ref || ref === missed?.ref) ? 'covering_lecture' : 'register_error');
    setNote('');
  }

  if (!data) {
    return (
      <aside className="lf-attendance" aria-label="Attendance">
        <h4>Attendance</h4>
        <p className={error ? 'ec-alert' : 'ec-muted'} role={error ? 'alert' : 'status'}>{error || 'Loading the register…'}</p>
        {error && <button type="button" onClick={load}>Try again</button>}
      </aside>
    );
  }

  const target = change ? byRef.get(change.ref) : undefined;
  return (
    <aside className="lf-attendance" aria-label="Attendance">
      <header>
        <h4>Attendance</h4>
        <small>{data.summary.present} attended · {data.summary.absent} absent{data.summary.unmarked ? ` · ${data.summary.unmarked} not marked` : ''}
          {data.summary.rate !== null && <> · <strong>{data.summary.rate}%</strong></>}</small>
      </header>
      {!data.set_up && <p className="ec-alert">{data.not_set_up}</p>}

      {covering && missed && (
        <div className="lf-attendance-hint">
          <p><strong>Attended the same lecture with another group?</strong> {covering.lecture} of {covering.module} on {lectureDay(covering.date)}
            {' '}shows as attended{data.usual_weekday && covering.weekday !== data.usual_weekday
              ? `, but this learner’s lectures are usually on ${data.usual_weekday}` : ''}.
            {' '}Confirm with the learner that it covered the missed {lectureDay(missed.date)} lecture.</p>
          {canEdit && missed.status !== 'present' && (
            <button type="button" className="primary" disabled={busy}
              onClick={() => void save([{ ref: missed.ref, action: 'present' }, { ref: covering.ref, action: 'delete' }], 'covering_lecture',
                `Attended ${covering.lecture} on ${lectureDay(covering.date)} with another group instead of ${lectureDay(missed.date)}.`)}>
              {busy ? 'Saving…' : `Learner confirmed: mark ${lectureDay(missed.date)} attended, delete ${lectureDay(covering.date)}`}
            </button>
          )}
        </div>
      )}

      <ol className="lf-attendance-list">
        {shown.map(record => {
          const [label, tone] = record.status ? STATUS[record.status] : ['Not marked', ''];
          return (
            <li key={record.ref} className={record.missed ? 'missed' : record.covering ? 'covering' : undefined}>
              <div>
                <strong>{lectureDay(record.date)}</strong>
                <span>{record.lecture} · {record.module || 'Module not recorded'}</span>
                <small>{record.missed ? 'This case’s missed lecture' : record.covering ? 'Possible covering lecture' : record.source === 'kbc' ? 'KBC register' : 'Live register'}
                  {record.corrected ? ' · corrected' : ''}</small>
              </div>
              <span className={`ec-tag ${tone}`}>{label}</span>
              {canEdit && (
                <div className="lf-attendance-actions">
                  {record.status !== 'present' && <button type="button" disabled={busy} onClick={() => start(record.ref, 'present')}>Mark attended</button>}
                  {record.status !== 'absent' && <button type="button" disabled={busy} onClick={() => start(record.ref, 'absent')}>Mark absent</button>}
                  {record.can_delete && <button type="button" disabled={busy} onClick={() => start(record.ref, 'delete')}>Delete</button>}
                </div>
              )}
              {change?.ref === record.ref && target && (
                <fieldset className="lf-attendance-form" disabled={busy}>
                  <p><strong>{data.actions[change.action]}:</strong> {lectureDay(target.date)}, {target.lecture}. This changes the LMS register too.</p>
                  <label>Reason
                    <select value={reason} onChange={event => setReason(event.target.value)}>
                      {Object.entries(data.reasons).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                    </select>
                  </label>
                  <label>What the learner said{reason === 'other' ? '' : ' (optional)'}
                    <textarea rows={2} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} />
                  </label>
                  <div className="ec-buttons">
                    <button type="button" className="primary" onClick={() => void save([change], reason, note)}>{busy ? 'Saving…' : 'Save the correction'}</button>
                    <button type="button" onClick={() => setChange(null)}>Cancel</button>
                  </div>
                </fieldset>
              )}
            </li>
          );
        })}
        {!shown.length && <li className="ec-muted">No lectures in the register for this learner.</li>}
      </ol>
      {data.records.length > data.window.length && (
        <button type="button" className="ed-sheet-link" onClick={() => setAll(value => !value)}>
          {all ? 'Show the lectures around the missed one' : `Show all ${data.records.length} lectures`}
        </button>
      )}
      {error && <p className="ec-alert" role="alert">{error}</p>}

      {data.edits.length > 0 && (
        <details className="lf-more">
          <summary>Corrections on this case ({data.edits.length})</summary>
          <ul className="lf-attendance-edits">
            {data.edits.map(edit => (
              <li key={edit.id}>
                <strong>{edit.action_label}: {lectureDay(edit.session_date)}</strong> · {edit.reason_label}
                <small>{edit.actor} · {when(edit.created_at)} · {edit.state === 'failed' ? `Not saved: ${edit.error}`
                  : edit.state === 'undone' ? `Undone by ${edit.undone_by}` : `AI check: ${edit.ai_label}`}</small>
                {edit.note && <small>“{edit.note}”</small>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </aside>
  );
}
