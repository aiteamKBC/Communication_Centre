import { useMemo, useState } from 'react';
import { useCallCentre } from '../call-centre/api';
import { appointmentTime, lectureDay, when } from '../call-centre/engagement/model';
import './coach.css';

type Entry = {
  id: number; coach_email: string; actor: string; actor_role: 'coach' | 'director'; action: string; action_label: string;
  learner_email: string; learner_name: string; details: Record<string, string | number | null>; created_at: string;
};

const str = (value: unknown) => (value === null || value === undefined ? '' : String(value));

/** What an entry was about, in words. */
function detail(entry: Entry) {
  const d = entry.details;
  const note = str(d.note) ? ` · “${str(d.note)}”` : '';
  switch (entry.action) {
    case 'caught_up':
      return `${lectureDay(str(d.date) || null)} · ${str(d.module) || 'Lecture'}${note}`;
    case 'absence_added':
      return `${d.starts_at ? appointmentTime(str(d.starts_at)) : lectureDay(str(d.date) || null)} · ${str(d.module) || 'Lecture'} · ${str(d.reason_label || d.reason)}${note}`;
    case 'absence_cancelled':
      return `${lectureDay(str(d.date) || null)} · ${str(d.module) || 'Lecture'}${note}`;
    case 'do_not_call_added':
      return `${str(d.reason_label || d.reason)} · ${d.until ? `until the end of ${lectureDay(str(d.until))}` : 'until lifted'}${note}`;
    default:
      return note.slice(3);
  }
}

/** The director's record of what was done on the coaches' desks: one coach's (``coach``), or everyone's with a filter. */
export default function CoachActivity({ coach, coaches }: { coach?: string; coaches?: { email: string; name: string }[] }) {
  const [chosen, setChosen] = useState('');
  const [action, setAction] = useState('');
  const who = coach || chosen;
  const log = useCallCentre<{ entries: Entry[] }>(`coaches/log/${who ? `?coach=${encodeURIComponent(who)}` : ''}`);
  const names = useMemo(() => new Map((coaches || []).map(c => [c.email, c.name])), [coaches]);
  const entries = (log.data?.entries || []).filter(entry => !action || entry.action === action);
  const actions = [...new Map((log.data?.entries || []).map(entry => [entry.action, entry.action_label])).entries()];

  return (
    <section className="ec-card cc cc-log" aria-labelledby="cc-log-title">
      <h2 id="cc-log-title">{coach ? 'What was done on this desk' : 'Coach activity log'}</h2>
      <p className="ec-muted">
        Every missed lecture marked as caught up, authorised absence and do-not-call change made on a coach’s desk, by the coach
        or by a director, newest first.
      </p>
      <div className="cc-log-filter">
        {!coach && coaches && (
          <select value={chosen} aria-label="Coach" onChange={event => setChosen(event.target.value)}>
            <option value="">All coaches</option>
            {coaches.map(c => <option key={c.email} value={c.email}>{c.name || c.email}</option>)}
          </select>
        )}
        <select value={action} aria-label="Action" onChange={event => setAction(event.target.value)}>
          <option value="">Every action</option>
          {actions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <button type="button" onClick={log.refresh} disabled={log.loading}>{log.loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      {!log.data ? <p className="ec-muted">{log.error || 'Loading the log…'}</p>
        : entries.length === 0 ? <p className="ec-muted">Nothing recorded yet.</p> : (
          <div className="ec-table-wrap">
            <table>
              <thead>
                <tr><th>When</th>{!coach && <th>Coach</th>}<th>Done by</th><th>What</th><th>Learner</th><th>Details</th></tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id}>
                    <td>{when(entry.created_at)}</td>
                    {!coach && <td>{names.get(entry.coach_email) || entry.coach_email}</td>}
                    <td>{entry.actor}<small>{entry.actor_role === 'director' ? 'Director' : 'Coach'}</small></td>
                    <td>{entry.action_label}</td>
                    <td>{entry.learner_name || entry.learner_email}<small>{entry.learner_name ? entry.learner_email : ''}</small></td>
                    <td>{detail(entry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}
