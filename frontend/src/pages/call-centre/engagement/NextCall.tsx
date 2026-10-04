import { useMemo, useState } from 'react';
import type { Overview, OverviewCase } from '../api';
import { caseAction, callDisabledReason } from './actions';
import type { Session } from './actions';
import { activeCase, casePurpose, categoryFor, contactKey, dueForCall, issueLabel, promiseLabel, shortDate, uniqueLearners } from './model';

type Props = { overview: Overview; session: Session; onRefresh: () => void; notify: (message: string, error?: boolean) => void; onOpen: (id: number) => void };

/** One button per thing that can happen on the call. `done` closes cases with nothing to prove. */
type Choice = { key: string; label: string; outcome: string; option?: string; note?: boolean; callback?: boolean };

function choicesFor(c: OverviewCase): Choice[] {
  const agreed: Choice[] = Object.entries(c.promises).map(([option, days]) => ({
    key: `reached:${option}`, outcome: 'reached', option,
    label: `${promiseLabel(option)}${days === null ? '' : ` (${days} days)`}`,
  }));
  return [
    ...(agreed.length ? agreed : c.specialist_closes ? [{ key: 'done', outcome: 'done', label: 'Done' }] : [{ key: 'reached', outcome: 'reached', label: 'Spoke to them' }]),
    { key: 'callback', outcome: 'callback', label: 'Call me back', callback: true },
    { key: 'wrong_number', outcome: 'wrong_number', label: 'Wrong number', note: true },
    { key: 'refused', outcome: 'refused', label: 'Refused or problem', note: true },
  ];
}

const CALLBACKS: [string, () => Date][] = [
  ['In 2 hours', () => new Date(Date.now() + 2 * 3600000)],
  ['Tomorrow 10:00', () => { const d = new Date(Date.now() + 86400000); d.setHours(10, 0, 0, 0); return d; }],
  ['Next week', () => { const d = new Date(Date.now() + 7 * 86400000); d.setHours(10, 0, 0, 0); return d; }],
];

/** The simple calling screen: one learner, one Call button, then one tap per issue for what happened. */
export default function NextCall({ overview, session, onRefresh, notify, onOpen }: Props) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  // Learners who did not answer this session go to the bottom straight away, before Zoom reports it.
  const [later, setLater] = useState<Set<string>>(new Set());
  const [calling, setCalling] = useState<string | null>(null);
  const [picked, setPicked] = useState<Map<number, string>>(new Map());
  const [callback, setCallback] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Same order as the server's priority: missed calls are already at the bottom.
  const queue = useMemo(() => uniqueLearners(overview.cases.filter(c => activeCase(c) && categoryFor(c, overview.today) !== null
    && c.source_type !== 'satisfaction' && !!c.learner_phone && c.attempts < 3 && dueForCall(c)
    && (!c.claimed_agent_id || c.claimed_agent_id === session.agentId))).filter(c => !done.has(contactKey(c))),
  [overview, session.agentId, done]);
  const open = queue.filter(c => !skipped.has(contactKey(c)));
  const waiting = [...open.filter(c => !later.has(contactKey(c))), ...open.filter(c => later.has(contactKey(c)))];
  const current = calling ? queue.find(c => contactKey(c) === calling) || null : waiting[0] || null;
  const issues = current ? overview.cases.filter(c => contactKey(c) === contactKey(current) && activeCase(c)
    && c.source_type !== 'satisfaction' && c.attempts < 3 && dueForCall(c)) : [];

  function reset(next: Set<string>) {
    setDone(next);
    setCalling(null);
    setPicked(new Map());
    setCallback(0);
    setNote('');
  }

  async function call() {
    if (!current) return;
    setBusy(true);
    try {
      await caseAction(session, current.id, 'call');
      setCalling(contactKey(current));
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : 'The call could not start.', true);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!current) return;
    const chosen = issues.map(c => [c, choicesFor(c).find(choice => choice.key === picked.get(c.id))] as const);
    if (chosen.some(([, choice]) => choice?.note) && !note.trim()) {
      notify('Add a short note for the manager.', true);
      return;
    }
    setBusy(true);
    try {
      let held = false;
      for (const [c, choice] of chosen) {
        if (!choice) continue;
        if (choice.outcome === 'done') {
          await caseAction(session, c.id, 'resolve', { note: note.trim() || 'Call completed.', option: 'other' });
          continue;
        }
        const result = await caseAction(session, c.id, 'plan', {
          outcome: choice.outcome, option: choice.option || '', note: note.trim(),
          callback_at: choice.callback ? CALLBACKS[callback][1]().toISOString() : null,
        });
        held = held || !result.applied;
      }
      notify(held ? `Saved for ${current.learner_name}. It is attached as soon as Zoom reports the call.` : `Saved for ${current.learner_name}.`);
      reset(new Set(done).add(contactKey(current)));
      onRefresh();
    } catch (failure) {
      notify(failure instanceof Error ? failure.message : 'The outcome could not be saved.', true);
    } finally {
      setBusy(false);
    }
  }

  function noAnswer() {
    if (!current) return;
    notify(`No answer from ${current.learner_name}. Zoom records it; the learner moves to the bottom of your list.`);
    setLater(new Set(later).add(contactKey(current)));
    reset(done);
    onRefresh();
  }

  if (!current) {
    return (
      <section className="ec-card ed-next">
        <div className="ec-empty">
          <h3>Nobody else to call right now</h3>
          <p>{skipped.size ? `You skipped ${skipped.size} ${skipped.size === 1 ? 'learner' : 'learners'}.` : 'Learners come back here when their follow-up is due.'}</p>
          {skipped.size > 0 && <button type="button" onClick={() => setSkipped(new Set())}>Show skipped learners</button>}
        </div>
      </section>
    );
  }

  const reason = callDisabledReason(current, session);
  const ready = issues.length > 0 && issues.every(c => picked.has(c.id));
  const needsCallback = issues.some(c => picked.get(c.id) === 'callback');
  return (
    <section className="ec-card ed-next">
      <p className="ec-muted">{calling ? 'On the call' : `Next call · ${waiting.length} ${waiting.length === 1 ? 'learner' : 'learners'} to call`}</p>
      <h2 className="ed-next-name">{current.learner_name}</h2>
      <p className="ec-muted">{current.programme || 'Programme not recorded'} · Coach: {current.coach || 'not recorded'} · {current.learner_phone}</p>
      {current.missed_call && <p className="ec-tag">Missed call · {current.attempts} of 3</p>}
      {current.promise_missed && <p className="ec-tag">Promise missed: call again</p>}

      {!calling ? (
        <>
          <h3>Why you are calling</h3>
          <ul>
            {issues.map(c => (
              <li key={c.id}>
                <strong>{issueLabel(c)}</strong>{c.source_type === 'attendance' && c.issue_date ? ` · ${shortDate(c.issue_date)}` : ''}
                <div className="ec-muted">{Object.keys(c.promises).length ? `Ask them to: ${Object.keys(c.promises).map(promiseLabel).join(' or ')}` : casePurpose(c)}</div>
              </li>
            ))}
          </ul>
          <button type="button" className="primary ed-next-call" disabled={busy || !!reason} title={reason || undefined} onClick={() => void call()}>
            {busy ? 'Opening Zoom…' : '📞 Call'}
          </button>
          {reason && <p className="ec-muted">{reason}</p>}
          <div className="ec-buttons" style={{ marginTop: '1rem' }}>
            <button type="button" onClick={() => setSkipped(new Set(skipped).add(contactKey(current)))}>Skip</button>
            <button type="button" className="ed-sheet-link" onClick={() => onOpen(current.id)}>Full case</button>
          </div>
        </>
      ) : (
        <>
          {issues.map(c => (
            <div key={c.id}>
              <h3>{issueLabel(c)}: what happened?</h3>
              <div className="ed-next-choices">
                {choicesFor(c).map(choice => (
                  <button key={choice.key} type="button" aria-pressed={picked.get(c.id) === choice.key} disabled={busy}
                    onClick={() => setPicked(new Map(picked).set(c.id, choice.key))}>{choice.label}</button>
                ))}
              </div>
            </div>
          ))}
          {needsCallback && (
            <div className="ed-next-choices" aria-label="When to call back">
              {CALLBACKS.map(([label], index) => (
                <button key={label} type="button" aria-pressed={callback === index} onClick={() => setCallback(index)}>{label}</button>
              ))}
            </div>
          )}
          <label>Note (optional, needed for a manager)
            <textarea rows={2} maxLength={5000} value={note} onChange={event => setNote(event.target.value)} />
          </label>
          <div className="ec-buttons" style={{ marginTop: '1rem' }}>
            <button type="button" className="primary ed-next-call" disabled={busy || !ready} onClick={() => void save()}>{busy ? 'Saving…' : 'Save and next'}</button>
          </div>
          <div className="ec-buttons" style={{ marginTop: '.5rem' }}>
            <button type="button" disabled={busy} onClick={noAnswer}>No answer: next</button>
            <button type="button" disabled={busy} onClick={() => reset(done)}>Back</button>
          </div>
        </>
      )}
    </section>
  );
}
