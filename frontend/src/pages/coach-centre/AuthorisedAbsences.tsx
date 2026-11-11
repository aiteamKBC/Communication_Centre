import { useState } from 'react';
import ErrorNotice from '../call-centre/engagement/ErrorNotice';
import type { Problem } from '../call-centre/engagement/formErrors';
import { appointmentTime, lectureDay, when } from '../call-centre/engagement/model';
import { saveOnDesk } from './desk';
import type { Absence, AbsenceState, CoachLearner, CoachOverview, DeskTarget, UpcomingLecture } from './types';

const STATES: Record<AbsenceState, [string, string]> = {
  coming: ['', 'Lecture still to come'],
  waiting: ['amber', 'Waiting for the register'],
  applied: ['green', 'Missed-lecture case closed'],
  no_absence: ['', 'No absence recorded: they likely attended'],
  cancelled: ['', 'Cancelled'],
};

const lectureLabel = (lecture: Pick<UpcomingLecture, 'starts_at' | 'module'> & { session_number?: number | null }) =>
  `${appointmentTime(lecture.starts_at)} · ${lecture.module || 'Lecture'}${lecture.session_number ? ` (session ${lecture.session_number})` : ''}`;
/** A lecture already under way (or over) stays on offer until its register comes in. */
const started = (lecture: Pick<UpcomingLecture, 'starts_at'>) => Date.parse(lecture.starts_at) <= Date.now();

/** A lecture in the next two weeks the learner said they will miss: when the register shows them absent, its
 * missed-lecture case closes as soon as it is made. */
export default function AuthorisedAbsences({ learner, target, days, reasons, setUp, notSetUp, error, onSaved }: {
  learner: CoachLearner; target: DeskTarget; days: number; reasons: Record<string, string>; setUp: boolean;
  notSetUp: string; error: string; onSaved: (data: CoachOverview, message: string) => void;
}) {
  const [session, setSession] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [cancelling, setCancelling] = useState<Absence | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const who = learner.name || learner.email;
  // A lecture already marked (and not cancelled) is shown, but cannot be marked twice.
  const marked = new Set(learner.absences.filter(a => a.state !== 'cancelled').map(a => a.session_ref));
  const chosen = learner.upcoming.find(lecture => lecture.ref === session);

  async function send(payload: Record<string, unknown>, action: string, message: string) {
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await saveOnDesk<CoachOverview>(target, 'absence', payload), message);
      return true;
    } catch (failure) {
      setProblem({ action, error: failure });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!chosen) return;
    if (await send({ action: 'add', learner_email: learner.email, session_ref: session, reason, note },
      'Marking the authorised absence', `${who}: ${lectureLabel(chosen)} marked as an authorised absence.`)) {
      setSession('');
      setReason('');
      setNote('');
    }
  }

  async function cancel() {
    if (!cancelling) return;
    if (await send({ action: 'cancel', id: cancelling.id, note: '' }, 'Cancelling the authorised absence',
      `${who}: the authorised absence on ${lectureDay(cancelling.date)} is cancelled.`)) setCancelling(null);
  }

  return (
    <section className="ec-card cc-section" aria-labelledby="cc-absence-title">
      <h3 id="cc-absence-title">Authorised absence</h3>
      <p className="ec-muted">
        The learner told {target.coach ? 'their coach' : 'you'} they will miss a lecture? Mark it now. When the register shows
        them absent, that missed lecture closes straight away: nobody calls them about it and there is nothing to mark afterwards.
      </p>
      {!setUp && <p className="ec-alert">{notSetUp}</p>}
      {error && <p className="ec-alert" role="alert">{error}</p>}
      {setUp && !error && (learner.upcoming.length === 0 ? (
        <p className="cc-none">
          No lectures for {who} in the next {days} days. Only lectures of the modules the LMS assigns them exactly (their
          training plan, or their group’s modules) are shown.
        </p>
      ) : (
        <fieldset disabled={busy} className="cc-form">
          <label>Lecture they will miss (next {days} days, or started with no register yet)
            <select name="session_ref" value={session} onChange={event => setSession(event.target.value)}>
              <option value="">Choose a lecture</option>
              {learner.upcoming.map(lecture => (
                <option key={lecture.ref} value={lecture.ref} disabled={marked.has(lecture.ref)}>
                  {lectureLabel(lecture)}{started(lecture) ? ' · started, register not in yet' : ''}{marked.has(lecture.ref) ? ' · already marked' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>Reason
            <select name="reason" value={reason} onChange={event => setReason(event.target.value)}>
              <option value="">Choose a reason</option>
              {Object.entries(reasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Note (optional)
            <textarea rows={2} maxLength={1000} value={note} onChange={event => setNote(event.target.value)}
              placeholder="For example: hospital appointment; will watch the recording." />
          </label>
          <div className="ec-buttons">
            <button type="button" className="primary" disabled={!chosen || !reason} onClick={() => void add()}>
              {busy ? 'Saving…' : 'Mark as authorised absence'}
            </button>
          </div>
        </fieldset>
      ))}
      <ErrorNotice problem={problem} />
      {learner.absences.length > 0 && (
        <ul className="cc-absences">
          {learner.absences.map(absence => {
            const [tone, words] = STATES[absence.state];
            const open = absence.state === 'coming' || absence.state === 'waiting';
            return (
              <li key={absence.id}>
                <div>
                  <strong>{lectureLabel(absence)}</strong>
                  <div className="ec-muted">
                    {absence.reason_label}{absence.note ? `: ${absence.note}` : ''} · marked by {absence.added_by}
                    {absence.added_role === 'director' ? ' (director)' : ''} {when(absence.created_at)}
                  </div>
                </div>
                <span className="cc-absence-state">
                  <span className={`ec-tag ${tone}`}>{words}</span>
                  {open && (cancelling?.id === absence.id ? (
                    <span className="ec-buttons">
                      <button type="button" disabled={busy} onClick={() => void cancel()}>{busy ? 'Saving…' : 'Yes, cancel it'}</button>
                      <button type="button" disabled={busy} onClick={() => setCancelling(null)}>Keep</button>
                    </span>
                  ) : (
                    <button type="button" className="ed-sheet-link" onClick={() => { setProblem(null); setCancelling(absence); }}>Cancel</button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
