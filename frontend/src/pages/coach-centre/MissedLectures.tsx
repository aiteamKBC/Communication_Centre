import { useState } from 'react';
import Dialog from '../call-centre/engagement/Dialog';
import ErrorNotice from '../call-centre/engagement/ErrorNotice';
import type { Problem } from '../call-centre/engagement/formErrors';
import { appointmentTime, lectureDay, longDate, when } from '../call-centre/engagement/model';
import { saveOnDesk } from './desk';
import type { CoachLearner, CoachOverview, DeskTarget, Lecture } from './types';

/** Where the Engagement Centre is with a missed lecture, in words, and its tag colour. */
function progress(lecture: Lecture, paused: boolean): [string, string] {
  if (lecture.state === 'catch_up_booked') return ['green', lecture.at ? `Catch-up booked: ${appointmentTime(lecture.at)}` : 'Catch-up booked'];
  if (lecture.state === 'promised') return ['amber', `Agreed to book a catch-up by ${longDate(lecture.at)}`];
  if (paused) return ['', 'Not called: on the do-not-call list'];
  if (lecture.state === 'callback') return ['amber', `Call back ${when(lecture.at)}`];
  if (lecture.state === 'calling') return ['', 'A specialist is working on it'];
  return ['', lecture.attempts ? `On the call list · ${lecture.attempts} unanswered call${lecture.attempts === 1 ? '' : 's'}` : 'On the call list'];
}

const MARKED_BY: Record<string, string> = { coach: 'marked by the coach', director: 'marked by the director' };

const lectureName = (lecture: Pick<Lecture, 'module' | 'missed_catch_up'>) =>
  `${lecture.missed_catch_up ? 'Missed catch-up · ' : ''}${lecture.module || 'Lecture'}`;

/** The learner's open missed lectures: the coach (or a director on their desk) ticks those caught up in a catch-up
 * session with the coach. */
export default function MissedLectures({ learner, target, coachName, onSaved }: {
  learner: CoachLearner; target: DeskTarget; coachName: string; onSaved: (data: CoachOverview, message: string) => void;
}) {
  const withCoach = target.coach ? coachName : 'you';
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const open = learner.lectures;
  // Ticks for lectures closed since (by a specialist, or on a refresh) drop out.
  const picked = open.filter(lecture => chosen.has(lecture.id));
  const all = open.length > 0 && picked.length === open.length;

  function toggle(id: number) {
    setChosen(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setProblem(null);
    try {
      const data = await saveOnDesk<CoachOverview & { closed: number }>(target, 'caught-up', { ids: picked.map(lecture => lecture.id), note });
      const { closed } = data;
      setConfirming(false);
      setChosen(new Set());
      setNote('');
      onSaved(data, closed < picked.length
        ? `${closed} of ${picked.length} marked as caught up for ${learner.name || learner.email}; the others had already closed.`
        : `${closed} missed lecture${closed === 1 ? '' : 's'} marked as caught up for ${learner.name || learner.email}.`);
    } catch (error) {
      setProblem({ action: 'Marking the lectures as caught up', error });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ec-card cc-section" aria-labelledby="cc-lectures-title">
      <div className="cc-section-head">
        <div>
          <h3 id="cc-lectures-title">Missed lectures</h3>
          <p className="ec-muted">
            The lectures the Engagement Centre has open for {learner.name || 'this learner'}. Tick the ones they have caught up
            in a catch-up session with {withCoach}: those cases close and nobody calls about them.
          </p>
        </div>
      </div>
      {open.length === 0 ? <p className="cc-none">No missed lectures open.</p> : (
        <>
          <div className="cc-select-all">
            <label className="cc-check">
              <input type="checkbox" checked={all} onChange={() => setChosen(all ? new Set() : new Set(open.map(lecture => lecture.id)))} />
              Select all {open.length}
            </label>
            <button type="button" className="primary" disabled={!picked.length} onClick={() => { setProblem(null); setConfirming(true); }}>
              Mark {picked.length || ''} as caught up
            </button>
          </div>
          <ul className="cc-lectures">
            {open.map(lecture => {
              const [tone, words] = progress(lecture, !!learner.do_not_call);
              return (
                <li key={lecture.id} className={chosen.has(lecture.id) ? 'chosen' : undefined}>
                  <label className="cc-check">
                    <input type="checkbox" checked={chosen.has(lecture.id)} onChange={() => toggle(lecture.id)} />
                    <span>
                      <strong>{lectureDay(lecture.date)}</strong>
                      <span className="cc-lecture-name">{lectureName(lecture)}</span>
                    </span>
                  </label>
                  <span className={`ec-tag ${tone}`}>{words}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {learner.caught_up.length > 0 && (
        <details className="cc-history">
          <summary>Caught up in the last 30 days ({learner.caught_up.length})</summary>
          <ul>
            {learner.caught_up.map(item => (
              <li key={item.id}>
                <strong>{lectureDay(item.date)}</strong> · {lectureName({ module: item.module, missed_catch_up: false })}
                <span className="ec-muted"> · {MARKED_BY[item.marked_by] || 'said by the learner on a call'} {when(item.marked_at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Mark as caught up" preservePosition>
        <p>
          {picked.length === 1 ? 'This missed lecture closes' : `These ${picked.length} missed lectures close`} as caught up in
          a catch-up session with {withCoach}. The Engagement Centre stops calling {learner.name || 'the learner'} about {picked.length === 1 ? 'it' : 'them'}.
          The LMS register is not changed.
        </p>
        <ul className="cc-confirm-list">
          {picked.map(lecture => <li key={lecture.id}><strong>{lectureDay(lecture.date)}</strong> · {lectureName(lecture)}</li>)}
        </ul>
        <label>Note (optional)
          <textarea rows={2} maxLength={1000} value={note} onChange={event => setNote(event.target.value)}
            placeholder="For example: the catch-up session on Monday 3 Nov covered both lectures." />
        </label>
        <ErrorNotice problem={problem} />
        <div className="ec-buttons">
          <button type="button" className="primary" disabled={busy || !picked.length} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Mark as caught up'}
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      </Dialog>
    </section>
  );
}
