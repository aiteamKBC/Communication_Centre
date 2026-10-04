import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, post } from '../api';
import type { Session } from './actions';
import Dialog from './Dialog';

type Options = {
  coach: { name: string; email: string };
  learner: { name: string; email: string };
  types: { key: string; label: string }[];
  lecture: { date: string; title: string } | null;
  reasons: { key: string; label: string }[];
  slots: { start: string; date: string; time: string }[];
};
type Booked = { booking: { start: string; coach: string; session_type: string }; warning: string };

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
const errorText = (reason: unknown) => (reason instanceof Error ? reason.message : 'Something went wrong. Try again.');

/** "Book" button: books the session straight into the coach's LMS calendar with a Teams meeting. */
export default function BookSession({ caseId, session, onBooked, notify, className }: {
  caseId: number; session: Session; onBooked: () => void; notify: (message: string, error?: boolean) => void; className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} disabled={session.preview || !session.canAct} title={session.preview ? 'Read-only preview' : undefined} onClick={() => setOpen(true)}>
        Book with coach
      </button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        {open && <BookingForm caseId={caseId} session={session} notify={notify} onDone={() => { setOpen(false); onBooked(); }} />}
      </Dialog>
    </>
  );
}

function BookingForm({ caseId, session, notify, onDone }: { caseId: number; session: Session; notify: (message: string, error?: boolean) => void; onDone: () => void }) {
  // One id per opened panel: a double click or retry can never book twice.
  const requestId = useMemo(() => crypto.randomUUID(), []);
  const [options, setOptions] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [type, setType] = useState('');
  const [day, setDay] = useState('');
  const [start, setStart] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const agent = session.agentId ? `?agent_id=${session.agentId}` : '';
    api<Options>(`tickets/${caseId}/booking/${agent}`, { signal: controller.signal })
      .then(value => { setOptions(value); setType(current => current || value.types[0]?.key || ''); setLoadError(''); })
      .catch(reason => { if (!controller.signal.aborted) setLoadError(errorText(reason)); });
    return () => controller.abort();
  }, [caseId, session.agentId, reload]);

  const days = useMemo(() => {
    const counts = new Map<string, number>();
    for (const slot of options?.slots || []) counts.set(slot.date, (counts.get(slot.date) || 0) + 1);
    return [...counts];
  }, [options]);
  const times = (options?.slots || []).filter(slot => slot.date === day);
  const catchUp = type === 'catch-up';
  const ready = !!start && (!catchUp || (!!reason && (reason !== 'other' || note.trim().length >= 3)));

  async function book() {
    setSaving(true);
    setError('');
    try {
      const result = await post<Booked>(`tickets/${caseId}/booking/`, session.csrf, {
        session_type: type, start, request_id: requestId, reason_category: catchUp ? reason : '', reason_note: catchUp ? note : '', agent_id: session.agentId,
      });
      const at = new Date(result.booking.start).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
      notify(`Booked with ${result.booking.coach} on ${at}. The learner and coach have the Teams invitation.${result.warning ? ` Note: ${result.warning}` : ''}`);
      onDone();
    } catch (reason) {
      setError(errorText(reason));
      if (reason instanceof ApiError && reason.status === 409) {
        setStart('');
        setReload(value => value + 1);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <><h2>Book with coach</h2><p className="ec-alert" role="alert">{loadError}</p></>;
  if (!options) return <><h2>Book with coach</h2><p className="ec-muted" role="status">Checking the coach’s calendar…</p></>;

  return (
    <form className="ec-form" onSubmit={event => { event.preventDefault(); if (ready && !saving) void book(); }}>
      <h2>Book with coach</h2>
      <p className="ec-muted">For {options.learner.name}. Goes straight into the coach’s LMS calendar with a Teams meeting; both get the invitation. Times are UK time.</p>
      {options.types.length > 1 && (
        <fieldset>
          <legend>Session</legend>
          {options.types.map(item => (
            <label key={item.key}><input type="radio" name="session-type" value={item.key} checked={type === item.key} onChange={() => setType(item.key)} /> {item.label}</label>
          ))}
        </fieldset>
      )}
      {catchUp && options.lecture && <p>Missed lecture: <strong>{options.lecture.title}</strong> on {dayLabel(options.lecture.date)}</p>}
      <label>Coach<input value={options.coach.name} readOnly /></label>
      <label>Date
        <select value={day} onChange={event => { setDay(event.target.value); setStart(''); }}>
          <option value="">{days.length ? 'Choose a date…' : 'No free times in the next 2 weeks'}</option>
          {days.map(([value, count]) => <option key={value} value={value}>{dayLabel(value)} ({count} free)</option>)}
        </select>
      </label>
      <label>Time (UK)
        <select value={start} disabled={!day} onChange={event => setStart(event.target.value)}>
          <option value="">{day ? 'Choose a time…' : 'Pick a date first'}</option>
          {times.map(slot => <option key={slot.start} value={slot.start}>{slot.time}</option>)}
        </select>
      </label>
      {catchUp && (
        <>
          <label>Reason for the absence (ask the learner)
            <select value={reason} onChange={event => setReason(event.target.value)}>
              <option value="">Choose a reason…</option>
              {options.reasons.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          {reason === 'other' && <label>What was the reason?<input value={note} maxLength={1000} onChange={event => setNote(event.target.value)} /></label>}
        </>
      )}
      {error && <p className="ec-alert" role="alert">{error}</p>}
      <div className="ec-buttons">
        <button type="submit" className="primary" disabled={!ready || saving}>{saving ? 'Booking…' : 'Book'}</button>
      </div>
    </form>
  );
}
