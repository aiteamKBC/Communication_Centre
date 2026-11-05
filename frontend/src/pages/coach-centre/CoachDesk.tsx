import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCallCentre } from '../call-centre/api';
import { signOut } from '../call-centre/signOut';
import AuthorisedAbsences from './AuthorisedAbsences';
import CallPause from './CallPause';
import MissedLectures from './MissedLectures';
import type { CoachLearner, CoachOverview, DeskTarget } from './types';
import '../call-centre/styles/engagement.css';
import './coach.css';

type Show = 'all' | 'missed' | 'paused';

const matches = (learner: CoachLearner, show: Show, query: string) =>
  (show === 'all' || (show === 'missed' ? learner.lectures.length > 0 : !!learner.do_not_call))
  && (!query || [learner.name, learner.email, learner.programme, learner.organisation].join(' ').toLowerCase().includes(query));

/** A coach's desk: their learners, each one's missed lectures and calls. The coach's own screen, or a director looking at
 * any coach's (``target.coach``), where what the director does is recorded as theirs. */
export default function CoachDesk({ target, onBack }: { target: DeskTarget; onBack?: () => void }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const own = !target.coach;
  const state = useCallCentre<CoachOverview>(own ? 'coach/' : `coaches/desk/?coach=${encodeURIComponent(target.coach || '')}`);
  // A save answers with the whole desk; the next load replaces it.
  const [saved, setSaved] = useState<{ after: CoachOverview | null; data: CoachOverview } | null>(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [show, setShow] = useState<Show>('all');
  const data = saved && saved.after === state.data ? saved.data : state.data;

  const learners = useMemo(() => data?.learners || [], [data]);
  const shown = useMemo(() => learners.filter(learner => matches(learner, show, search.trim().toLowerCase())), [learners, show, search]);
  const selectedEmail = params.get('learner') || '';
  const selected = learners.find(learner => learner.email === selectedEmail) || null;
  const select = useCallback((email: string) => setParams(current => {
    const next = new URLSearchParams(current);
    next.set('learner', email);
    return next;
  }), [setParams]);

  const loaded = state.data;
  const onSaved = useCallback((next: CoachOverview, text: string) => {
    setSaved({ after: loaded, data: next });
    setMessage(text);
  }, [loaded]);

  if (state.status === 401) {
    return (
      <div className="staff-empty">
        <h2>Please sign in again</h2>
        <p>The Engagement Centre needs a fresh sign-in to confirm who you are.</p>
        <button type="button" className="staff-button" onClick={() => signOut(navigate)}>Sign in</button>
      </div>
    );
  }
  if (state.status === 403) return <div className="staff-empty"><h2>No access</h2><p>{state.error}</p></div>;
  if (!data) {
    return state.error
      ? <div role="alert"><p>{state.error}</p><button type="button" onClick={state.refresh}>Try again</button></div>
      : <p>{own ? 'Loading your learners…' : 'Loading the coach’s learners…'}</p>;
  }

  const openLectures = learners.reduce((total, learner) => total + learner.lectures.length, 0);
  const coachName = data.coach.name || data.coach.email;
  return (
    <div className="ec ed cc">
      <div className="ec-head">
        <div>
          {own ? (
            <>
              <div className="ec-eyebrow">Kent Business College · Engagement · Coach</div>
              <h1>My learners</h1>
              <div className="ec-muted">{data.coach.name} · learners whose coach email in the LMS is {data.coach.email || 'not set on your account'}</div>
            </>
          ) : (
            <>
              <div className="ec-eyebrow">Coach’s desk</div>
              <h2 className="cc-coach-name">{coachName}</h2>
              <div className="ec-muted">{data.coach.email} · what you do here is recorded as yours, the director’s</div>
            </>
          )}
        </div>
        <div className="ec-buttons">
          {onBack && <button type="button" onClick={onBack}>All coaches</button>}
          <button type="button" onClick={() => { setMessage(''); state.refresh(); }} disabled={state.loading}>
            {state.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
      {!data.complete && <p className="ec-alert" role="alert">Not every learner source could be read just now, so this list may be short. Refresh in a few minutes.</p>}
      {state.error && <p className="ec-alert" role="alert">Could not refresh: {state.error} Showing the last loaded list.</p>}
      <div className="ec-status" role="status" aria-live="polite">{message}</div>

      <div className="ec-grid cc-stats">
        <div className="ec-card ec-stat"><span>{own ? 'My learners' : 'Learners'}</span><strong>{learners.length}</strong></div>
        <div className="ec-card ec-stat"><span>Missed lectures open</span><strong>{openLectures}</strong></div>
        <div className="ec-card ec-stat"><span>Learners with missed lectures</span><strong>{learners.filter(l => l.lectures.length).length}</strong></div>
        <div className="ec-card ec-stat"><span>Not being called</span><strong>{learners.filter(l => l.do_not_call).length}</strong></div>
      </div>

      {learners.length === 0 ? (
        <div className="ec-card ec-empty">
          <h2>No learners found for {data.coach.email || 'your account'}</h2>
          <p>
            {own ? 'Your learners are' : 'A coach’s learners are'} the active learners whose coach in the LMS has this email. If they
            are missing, check that the email on {own ? 'your account' : 'the coach’s account'} matches the coach email on their LMS records.
          </p>
        </div>
      ) : (
        <div className="ed-desk">
          <aside className="ec-card ed-queue" aria-label={own ? 'My learners' : `${coachName}’s learners`}>
            <div className="ed-filters">
              <input type="search" value={search} placeholder="Name, email, programme or employer" aria-label="Find a learner"
                onChange={event => setSearch(event.target.value)} />
              <select value={show} aria-label="Show" onChange={event => setShow(event.target.value as Show)}>
                <option value="all">{own ? 'All my learners' : 'All learners'}</option>
                <option value="missed">With missed lectures</option>
                <option value="paused">Not being called</option>
              </select>
            </div>
            <div className="ed-queue-heading"><strong>Learners</strong><span>{shown.length} of {learners.length}</span></div>
            <div className="cc-roster">
              {shown.length === 0 && <p className="ec-muted cc-roster-empty">No learner matches.</p>}
              {shown.map(learner => (
                <button type="button" key={learner.email} aria-current={learner.email === selectedEmail ? 'true' : undefined}
                  className={`ed-person${learner.email === selectedEmail ? ' selected' : ''}`} onClick={() => select(learner.email)}>
                  <span className="ed-person-name">{learner.name || learner.email}</span>
                  <small>{learner.programme || 'Programme not recorded'}</small>
                  <span className="cc-badges">
                    {learner.lectures.length > 0 && <span className="ec-tag amber">{learner.lectures.length} missed</span>}
                    {learner.do_not_call && <span className="ec-tag red">Not called</span>}
                  </span>
                </button>
              ))}
            </div>
          </aside>
          <div className="ed-work">
            {!selected ? (
              <div className="ec-card ed-start">
                <h2>Choose a learner</h2>
                <p>
                  Pick a learner to see the missed lectures the Engagement Centre has open for them. Mark the ones they have
                  caught up with {own ? 'you' : coachName}, or stop the calls for a while, with a reason.
                </p>
              </div>
            ) : (
              <div className="ec-stack">
                <section className="ec-card ed-learner">
                  <h2>{selected.name || selected.email}</h2>
                  <p className="ec-muted">{[selected.programme, selected.organisation, selected.email].filter(Boolean).join(' · ')}</p>
                </section>
                <MissedLectures key={`lectures:${selected.email}`} learner={selected} target={target} coachName={coachName} onSaved={onSaved} />
                <AuthorisedAbsences key={`absences:${selected.email}`} learner={selected} target={target} days={data.absences.days}
                  reasons={data.absences.reasons} setUp={data.absences.set_up} notSetUp={data.absences.not_set_up}
                  error={data.absences.error} onSaved={onSaved} />
                <CallPause key={`calls:${selected.email}`} learner={selected} target={target} setUp={data.do_not_call.set_up}
                  notSetUp={data.do_not_call.not_set_up} reasons={data.do_not_call.reasons} onSaved={onSaved} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
