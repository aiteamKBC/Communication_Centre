import { useMemo, useState } from 'react';
import CoachDesk from '../../coach-centre/CoachDesk';
import { useCallCentre } from '../api';

type Coach = {
  email: string; name: string; learners: number; missed_lectures: number; learners_with_missed: number;
  not_called: number; has_access: boolean;
};
type Listing = { coaches: Coach[]; unmatched_learners: number; complete: boolean };
type Order = 'name' | 'missed';

/** The director's Coaches tab: every coach with active learners, and any coach's desk opened from it. */
export default function Coaches({ coach, onOpen, onBack }: {
  coach: string | null; onOpen: (email: string) => void; onBack: () => void;
}) {
  if (coach) return <CoachDesk key={coach} target={{ coach }} onBack={onBack} />;
  return <CoachIndex onOpen={onOpen} />;
}

function CoachIndex({ onOpen }: { onOpen: (email: string) => void }) {
  const listing = useCallCentre<Listing>('coaches/');
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<Order>('name');
  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    const found = (listing.data?.coaches || []).filter(c => !query || `${c.name} ${c.email}`.toLowerCase().includes(query));
    return order === 'missed' ? [...found].sort((a, b) => b.missed_lectures - a.missed_lectures) : found;
  }, [listing.data, search, order]);

  if (!listing.data) {
    return listing.error
      ? <div role="alert"><p>{listing.error}</p><button type="button" onClick={listing.refresh}>Try again</button></div>
      : <p>Loading the coaches…</p>;
  }
  const { coaches, unmatched_learners: unmatched, complete } = listing.data;
  return (
    <div className="dd">
      <p className="ec-muted">
        Each coach’s learners, from the coach email on their LMS records. Open a coach to see their desk: their learners’ missed
        lectures and calls, as the coach sees them. Coaches use their own screen once “Engagement Centre coach” is ticked on
        their account in Django admin.
      </p>
      {!complete && <p className="ec-alert" role="alert">Not every learner source could be read just now, so these numbers may be short.</p>}
      {listing.error && <p className="ec-alert" role="alert">Could not refresh: {listing.error} Showing the last loaded list.</p>}
      {unmatched > 0 && (
        <p className="ec-alert">
          {unmatched} active learner{unmatched === 1 ? ' has' : 's have'} a coach with no single known email, so they are on no
          coach’s desk. Their coach email in the LMS needs fixing.
        </p>
      )}
      <div className="ec-tools">
        <input type="search" value={search} placeholder="Find a coach" aria-label="Find a coach" onChange={event => setSearch(event.target.value)} />
        <select value={order} aria-label="Order" onChange={event => setOrder(event.target.value as Order)}>
          <option value="name">By name</option>
          <option value="missed">Most missed lectures first</option>
        </select>
        <span className="ec-muted">{shown.length} of {coaches.length} coaches</span>
      </div>
      {shown.length === 0 ? <p className="ec-muted">{coaches.length ? 'No coach matches.' : 'No coach has active learners.'}</p> : (
        <div className="dd-people">
          {shown.map(c => (
            <button key={c.email} type="button" className="dd-person" onClick={() => onOpen(c.email)}>
              <span className="dd-person-head">
                <strong>{c.name || c.email}</strong>
                <span>{c.email}</span>
              </span>
              <span><span className={`ec-tag ${c.has_access ? 'green' : ''}`}>{c.has_access ? 'Uses the coaches’ screen' : 'No coach access yet'}</span></span>
              <span className="dd-person-figures">
                <span><b>{c.learners}</b>learners</span>
                <span><b>{c.missed_lectures}</b>missed lectures</span>
                <span><b>{c.learners_with_missed}</b>learners missing</span>
                <span><b>{c.not_called}</b>not called</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
