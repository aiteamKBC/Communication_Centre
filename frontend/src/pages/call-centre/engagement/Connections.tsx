import type { Overview } from '../api';
import { human, longDate } from './model';

const rules: [string, string][] = [
  ['Missed lecture: due within 2 working days', 'A catch-up session booked in the LMS calendar, or attendance evidence. Lectures appear 3 days after they happen.'],
  ['Progress review or monthly coaching overdue: 3 working days', 'The review or meeting is booked and recorded in Aptem.'],
  ['Off-the-job hours or EPA preparation: 5 working days', 'The source shows the learner back on track.'],
  ['Tomorrow’s appointment', 'Attendance confirmed or the session rebooked before it starts.'],
  ['Learner satisfaction: every three calendar months, 10 working days', 'Active, Delivery and Onboarding learners (LMS status first). Complete feedback after an answered Zoom call. Failed calls and emails do not restart the clock. A review that cannot be done is closed without feedback; the next is due three months later.'],
  ['Employer satisfaction: every three calendar months, 10 working days', 'One call per line manager (from Aptem) who has a current learner, made by the specialist who looks after those learners. Same feedback form and rules as learner satisfaction.'],
  ['Unanswered calls', 'The learner can be called again straight away and moves to the bottom of the list (satisfaction calls: from 9am the next working day).'],
];

/** Source health and the rules that open and close cases. */
export default function Connections({ overview, onView }: { overview: Overview; onView: (view: string) => void }) {
  return (
    <>
      <section className="ec-card">
        <h2>Eventbrite organiser connection</h2>
        <p>Connect your organiser accounts and browse event registrations.</p>
        <button type="button" className="primary" onClick={() => onView('eventbrite')}>Open Eventbrite setup</button>
      </section>
      <div className="ec-connection-list">
        {overview.sources.map(source => {
          const error = source.details?.error;
          return (
            <article key={source.name} className="ec-card">
              <h3>{human(source.name.replace(/^source:/, ''))}</h3>
              <span className={`ec-tag ${error ? 'amber' : source.last_success_at ? 'green' : 'amber'}`}>{error ? 'error' : source.last_success_at ? 'connected' : 'pending'}</span>
              <p>{error || (source.last_success_at ? 'Source read successfully in the last cycle.' : 'Awaiting the first successful read.')}</p>
              <div className="ec-muted">Last success {longDate(source.last_success_at)}</div>
            </article>
          );
        })}
        <article className="ec-card">
          <h3>case cycle</h3>
          <span className={`ec-tag ${overview.cycle?.last_success_at ? 'green' : 'amber'}`}>{overview.cycle?.last_success_at ? 'connected' : 'pending'}</span>
          <p>The worker refreshes sources, opens and closes cases and sends emails ({overview.connections.email_mode.replace('_', ' ')} mode).</p>
          <div className="ec-muted">Last success {longDate(overview.cycle?.last_success_at)}</div>
        </article>
      </div>
      <section className="ec-card" style={{ marginTop: '1.2rem' }}>
        <h2>Case rules</h2>
        <table>
          <thead><tr><th>Reason for calling</th><th>What finishes the work</th></tr></thead>
          <tbody>{rules.map(([reason, finish]) => <tr key={reason}><td>{reason}</td><td>{finish}</td></tr>)}</tbody>
        </table>
        <p className="ec-muted">Only Zoom Phone records establish no answer, duration and call attempts. An operator note cannot alter these figures. Cases are prioritised by risk, overdue time, missed sessions and attempts.</p>
      </section>
    </>
  );
}
