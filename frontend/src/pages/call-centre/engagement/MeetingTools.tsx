import { useEffect, useMemo, useState } from 'react';
import { api, post } from '../api';
import type { ReviewMeetingSummary } from '../api';
import type { Session } from './actions';
import Dialog from './Dialog';
import ErrorNotice from './ErrorNotice';
import type { Problem } from './formErrors';
import { CANCEL_REASONS, meetingState } from './meetingWords';

type Mode = 'cancel' | 'reschedule';
type Times = { start: string; times: { start: string; date: string; time: string }[] };

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
const moment = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

/** On a next-day reminder: the Outlook meeting's state (the learner's reply, confirmed, cancelled), and Cancel or
 * reschedule when the learner cannot come. Either way Outlook tells the learner, the LMS entry follows and the coach gets
 * a note. Rescheduling offers only times the coach's calendar shows free. */
export default function MeetingTools({ c, session, notify, onChanged }: {
  c: { id: number; learner_name: string; meeting?: ReviewMeetingSummary | null }; session: Session;
  notify: (message: string, error?: boolean) => void; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('cancel');
  const [reason, setReason] = useState('cannot_attend');
  const [note, setNote] = useState('');
  const [times, setTimes] = useState<Times | null>(null);
  const [day, setDay] = useState('');
  const [start, setStart] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const meeting = c.meeting;

  // The coach's free times, asked for once the specialist chooses to reschedule.
  useEffect(() => {
    if (!open || mode !== 'reschedule' || times) return undefined;
    let live = true;
    api<Times>(`tickets/${c.id}/meeting/${session.agentId ? `?agent_id=${session.agentId}` : ''}`)
      .then(value => { if (live) setTimes(value); })
      .catch(failure => { if (live) setProblem({ action: 'Finding the coach’s free times', error: failure }); });
    return () => { live = false; };
  }, [open, mode, times, c.id, session.agentId]);

  const days = useMemo(() => [...new Set((times?.times || []).map(slot => slot.date))], [times]);
  if (!meeting) return null;
  const [label, tone] = meetingState(meeting);
  const reasons = mode === 'cancel' ? CANCEL_REASONS : CANCEL_REASONS.filter(([key]) => key !== 'rebooked');

  function close() {
    setOpen(false);
    setProblem(null);
  }

  async function save() {
    setBusy(true);
    setProblem(null);
    try {
      const result = await post<{ start: string }>(`tickets/${c.id}/meeting/`, session.csrf, {
        action: mode, reason, note: note.trim(), agent_id: session.agentId, ...(mode === 'reschedule' ? { start } : {}),
      });
      close();
      notify(mode === 'cancel'
        ? `${c.learner_name}’s meeting is cancelled. Outlook has told them and their coach has a note.`
        : `${c.learner_name}’s meeting is moved to ${moment(result.start)}. Outlook has sent them the new time and their coach has a note.`);
      onChanged();
    } catch (failure) {
      setProblem({ action: mode === 'cancel' ? 'Cancelling the meeting' : 'Rescheduling the meeting', error: failure });
      if (mode === 'reschedule') {   // the free times may have changed: ask again
        setTimes(null);
        setDay('');
        setStart('');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ed-meeting">
      <span className={`ec-tag ${tone}`}>{label}</span>
      {meeting.cancellable && (
        <button type="button" className="ed-sheet-link" disabled={session.preview || !session.canAct} onClick={() => setOpen(true)}>
          Cancel or reschedule
        </button>
      )}
      <Dialog open={open} onClose={close} title="Cancel or reschedule">
        <p><strong>{c.learner_name}’s meeting.</strong> Outlook tells {c.learner_name} straight away, the LMS calendar entry
          changes with it, and the coach gets a note.</p>
        <fieldset className="ed-meeting-reasons">
          <legend>What to do</legend>
          <label><input type="radio" name={`mode-${c.id}`} checked={mode === 'cancel'} onChange={() => { setMode('cancel'); setProblem(null); }} />
            {' '}Cancel only: the learner books a new time with their coach</label>
          <label><input type="radio" name={`mode-${c.id}`} checked={mode === 'reschedule'}
            onChange={() => { setMode('reschedule'); setProblem(null); if (reason === 'rebooked') setReason('cannot_attend'); }} />
            {' '}Cancel &amp; reschedule: move it to a time the coach is free</label>
        </fieldset>
        {mode === 'reschedule' && (
          <div className="ec-form">
            <label>Day
              <select value={day} onChange={event => { setDay(event.target.value); setStart(''); }} disabled={!times}>
                <option value="">{!times ? 'Finding the coach’s free times…' : days.length ? 'Choose a day…' : 'No free times in the next 2 weeks'}</option>
                {days.map(value => <option key={value} value={value}>{dayLabel(value)}</option>)}
              </select>
            </label>
            <label>Time (UK)
              <select value={start} onChange={event => setStart(event.target.value)} disabled={!day}>
                <option value="">{day ? 'Choose a time…' : 'Pick a day first'}</option>
                {(times?.times || []).filter(slot => slot.date === day).map(slot => <option key={slot.start} value={slot.start}>{slot.time}</option>)}
              </select>
            </label>
          </div>
        )}
        <fieldset className="ed-meeting-reasons">
          <legend>Why</legend>
          {reasons.map(([value, text]) => (
            <label key={value}><input type="radio" name={`reason-${c.id}`} value={value} checked={reason === value}
              onChange={() => setReason(value)} /> {text}</label>
          ))}
        </fieldset>
        <label>Note for the coach (optional)
          <textarea maxLength={2000} value={note} onChange={event => setNote(event.target.value)}
            placeholder="For example: shift changed, mornings suit better" />
        </label>
        <ErrorNotice problem={problem} />
        <div className="ec-buttons">
          <button type="button" className="primary" disabled={busy || (mode === 'reschedule' && !start)} onClick={() => void save()}>
            {busy ? 'Saving…' : mode === 'cancel' ? 'Cancel the meeting' : 'Move the meeting'}
          </button>
          <button type="button" disabled={busy} onClick={close}>Keep it as it is</button>
        </div>
      </Dialog>
    </div>
  );
}
