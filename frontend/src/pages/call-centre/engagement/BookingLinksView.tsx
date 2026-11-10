import type { BookingLinks, Overview } from '../api';

const names: Record<string, string> = { mcm: 'Monthly coaching', pr: 'Progress review', support: 'Support session' };

/** Microsoft Bookings services per coach in the current register. */
export default function BookingLinksView({ overview }: { overview: Overview }) {
  const coaches = new Map<string, { learners: Set<string>; links: BookingLinks }>();
  for (const c of overview.cases) {
    const coach = c.coach.trim();
    if (!coach) continue;
    const entry = coaches.get(coach) || { learners: new Set<string>(), links: c.booking_links };
    entry.learners.add(c.learner_email.toLowerCase());
    coaches.set(coach, entry);
  }
  const rows = [...coaches.entries()].sort(([a], [b]) => a.localeCompare(b));
  return (
    <section className="ec-card">
      <h2>Coach booking links</h2>
      <p>Open the coach’s service while speaking with a learner, or copy its link into a booking invitation.</p>
      <p className="ec-muted">Links come from each coach’s page in the LMS Coach directory. The link that fits the case is included in each learner’s booking email (missed-lecture catch-ups use the coach’s support link).</p>
      <div className="ec-table-wrap">
        <table>
          <thead><tr><th>Coach</th><th>Learners</th><th>Booking services</th></tr></thead>
          <tbody>
            {rows.map(([coach, entry]) => (
              <tr key={coach}>
                <td><strong>{coach}</strong></td>
                <td>{entry.learners.size}</td>
                <td>
                  {Object.entries(entry.links).length
                    ? Object.entries(entry.links).map(([kind, url]) => <p key={kind}><a href={url} target="_blank" rel="noopener noreferrer">{names[kind] || kind}</a></p>)
                    : 'No Microsoft Bookings page is mapped for this coach'}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={3}>No coaches in the current register.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
