import { useState } from 'react';
import type { ReactNode } from 'react';
import type { OverviewCase } from '../api';
import { caseAction } from './actions';
import type { Session } from './actions';
import Dialog from './Dialog';
import SatisfactionFeedback from './SatisfactionFeedback';
import {
  QUICK_FOLLOW_UPS, closesCase, isSatisfaction, issueLabel, londonInput, longDate, outcomeChoices, outcomeHelp, shortDate, splitOutcome, workdayInput,
} from './model';

// The server's save_call outcomes beyond the call sheet's: close a case the specialist closes, or leave one undiscussed.
const RESOLVE = 'resolve';
const NOT_DISCUSSED = 'not_discussed';
// The server's answer when the call was already recorded on another screen (Full case or Next call).
const ALREADY_SAVED = 'This call has already been saved.';

/** The first question after a call. Anything but Answered is the same for every case on the call. */
const ANSWERS: [string, string][] = [['answered', 'Answered'], ['no_answer', 'No answer'], ['wrong_number', 'Wrong number'], ['callback', 'Asked for a callback']];
const WHOLE_CALL_HELP: Record<string, string> = {
  no_answer: 'Saved as a missed call on every case. They come back on the follow-up date, or the next working morning.',
  wrong_number: 'Recorded on every case with your note. They come back on the follow-up date, or the next working day.',
  callback: 'Every case comes back to the list at the time you choose.',
};

/** What can happen to one case on an answered call. */
function choicesFor(c: OverviewCase): [string, string][] {
  const reached = isSatisfaction(c)
    ? [['reached', 'Reached: complete the feedback after saving'] as [string, string]]
    : outcomeChoices(c).filter(([value]) => splitOutcome(value).outcome === 'reached');
  return [
    ...reached,
    ...(c.specialist_closes ? [[RESOLVE, 'Done: resolve the case'] as [string, string]] : []),
    ['callback', 'Callback requested'], ['refused', 'Refused or problem'], [NOT_DISCUSSED, 'Not discussed: keep it open'],
  ];
}

function helpFor(choice: string, c: OverviewCase) {
  if (choice === RESOLVE && c.employer_check && !c.employer_check.done) {
    return 'A progress review is confirmed with the employer too: save the employer step first, or choose another outcome.';
  }
  if (choice === RESOLVE) return 'The case is resolved when you save.';
  if (choice === NOT_DISCUSSED) return 'Nothing is recorded; the case comes back on the follow-up date, or the next working morning.';
  return outcomeHelp(choice, c);
}

/** Cases that take the same choices under the same name are answered together (five missed lectures: one row). */
const groupKey = (c: OverviewCase) => (isSatisfaction(c) ? `case:${c.id}` : `${issueLabel(c)}|${choicesFor(c).map(([value]) => value).join()}`);

/** Which one of a group a case is: the lecture date, or its own name. */
const caseDetail = (c: OverviewCase) => (c.issue_date ? shortDate(c.issue_date) : c.issue_name);

type Props = {
  /** The case the call was started from: the server finds the call through it. */
  callFrom: number; name: string;
  /** The cases on the call, as the server listed them when Call was pressed. */
  issues: OverviewCase[];
  session: Session; notify: (message: string, error?: boolean) => void;
  /** Saved (the message says so), and any satisfaction feedback completed or put off. */
  onSaved: (message: string) => void;
  /** Cases closed during the call (a booked catch-up): nothing to record for them. */
  closed?: ReadonlySet<number>;
  /** Booking and email actions for one case. */
  tools?: (c: OverviewCase) => ReactNode;
  saveLabel?: string;
};

/** One form for the whole call: did they answer, then (if so) one row per kind of case, saved together. */
export default function CallOutcome({ callFrom, name, issues, session, notify, onSaved, closed = new Set(), tools, saveLabel = 'Save and next' }: Props) {
  const [answer, setAnswer] = useState('');
  const [picked, setPicked] = useState<Map<number, string>>(new Map());
  const [caseNotes, setCaseNotes] = useState<Map<number, string>>(new Map());
  const [split, setSplit] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<OverviewCase[]>([]);
  const [savedMessage, setSavedMessage] = useState('');
  // Shown in the form as well as notified: in Full case the page's messages sit behind the pop-up.
  const [error, setError] = useState('');

  const open = issues.filter(c => !closed.has(c.id));
  const groups = [...open.reduce((all, c) => all.set(groupKey(c), [...(all.get(groupKey(c)) || []), c]), new Map<string, OverviewCase[]>())];
  const answered = answer === 'answered';
  const choiceOf = (c: OverviewCase) => (answered ? picked.get(c.id) || '' : answer);
  const missing = answered ? open.filter(c => !picked.has(c.id)).length : 0;
  const closing = open.length > 0 && answered && open.every(c => picked.get(c.id) === RESOLVE || closesCase(picked.get(c.id) || '', c));

  function pick(cases: OverviewCase[], choice: string) {
    const next = new Map(picked);
    for (const c of cases) {
      if (choice) next.set(c.id, choice);
      else next.delete(c.id);
    }
    setPicked(next);
  }

  /** Sets every case to the same kind of outcome; "agreed" is each case's first agreed action. */
  function pickAll(choice: string) {
    const next = new Map(picked);
    for (const c of open) next.set(c.id, choice === 'agreed' ? choicesFor(c)[0][0] : choice);
    setPicked(next);
  }

  function problem() {
    if (!open.length) return '';
    if (!answer) return `Choose whether ${name} answered.`;
    if (missing) return `${missing} ${missing === 1 ? 'case still needs' : 'cases still need'} an outcome.`;
    if (answer !== 'no_answer' && note.trim().length < 10) return 'Add a short note: what was agreed and the next action (at least 10 characters).';
    if (open.some(c => choiceOf(c) === 'callback') && !followUp) return 'Choose the date and time for the callback.';
    if (followUp && londonInput(followUp).getTime() <= Date.now()) return 'Choose a follow-up time in the future.';
    return '';
  }

  async function save() {
    const reason = problem();
    setError(reason);
    if (reason) {
      notify(reason, true);
      return;
    }
    if (!open.length) {
      onSaved(`Nothing left to record for ${name}.`);
      return;
    }
    setBusy(true);
    try {
      const items = open.map(c => {
        const { outcome, option } = splitOutcome(choiceOf(c));
        return { id: c.id, outcome, option, note: answered ? (caseNotes.get(c.id) || '').trim() : '' };
      });
      await caseAction(session, callFrom, 'save_call', {
        items, note: note.trim(), callback_at: followUp ? londonInput(followUp).toISOString() : null,
      });
      const message = `Saved for ${name}.`;
      // A reached review is completed in its own form; the other cases are already saved.
      const reviews = answered ? open.filter(c => isSatisfaction(c) && picked.get(c.id) === 'reached') : [];
      if (reviews.length) {
        notify(message);
        setSavedMessage(message);
        setFeedback(reviews);
      } else {
        onSaved(message);
      }
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'The outcome could not be saved.';
      if (message === ALREADY_SAVED) {
        onSaved(`The call with ${name} was already saved.`);
      } else {
        setError(message);
        notify(message, true);
      }
    } finally {
      setBusy(false);
    }
  }

  function finishFeedback() {
    setFeedback([]);
    onSaved(savedMessage);
  }

  /** One case's outcome, help, note and actions; inside a group the help is kept to the tooltip, to keep the rows short. */
  function caseRow(c: OverviewCase, label: ReactNode, inGroup = false) {
    const choice = picked.get(c.id) || '';
    const actions = tools?.(c);
    return (
      <div key={c.id} className="ed-call-case">
        <div className="ed-call-case-line">
          <span>{label}</span>
          <select aria-label={`Outcome for ${issueLabel(c)}${c.issue_date ? ` ${shortDate(c.issue_date)}` : ''}`} value={choice}
            title={choice ? helpFor(choice, c) : undefined} disabled={busy} onChange={event => pick([c], event.target.value)}>
            <option value="">Choose outcome…</option>
            {choicesFor(c).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </div>
        {choice && !inGroup && <small>{helpFor(choice, c)}</small>}
        <details className="ed-call-more">
          <summary>{actions ? 'Note, booking and email' : 'Note for this case'}</summary>
          <textarea rows={2} maxLength={3500} aria-label={`Note for ${issueLabel(c)}`} placeholder="Only for this case, added to the shared note"
            value={caseNotes.get(c.id) || ''} onChange={event => setCaseNotes(new Map(caseNotes).set(c.id, event.target.value))} />
          {actions}
        </details>
      </div>
    );
  }

  /** Switches a group between one outcome for all and one per case; joining them up clears differing outcomes. */
  function together(key: string, cases: OverviewCase[], separate: boolean) {
    const next = new Set(split);
    if (separate) {
      next.delete(key);
      if (new Set(cases.map(c => picked.get(c.id) || '')).size > 1) pick(cases, '');
    } else {
      next.add(key);
    }
    setSplit(next);
  }

  function groupRow([key, cases]: [string, OverviewCase[]]) {
    const first = cases[0];
    if (cases.length === 1) return caseRow(first, <strong>{issueLabel(first)}</strong>);
    const values = new Set(cases.map(c => picked.get(c.id) || ''));
    const same = values.size === 1 ? [...values][0] : null;
    const separate = split.has(key) || same === null;
    return (
      <div key={key} className="ed-call-group">
        <div className="ed-call-case-line">
          <span><strong>{issueLabel(first)} ×{cases.length}</strong>
            <button type="button" className="ed-sheet-link" disabled={busy} onClick={() => together(key, cases, separate)}>
              {separate ? 'Answer them together' : 'Answer each one'}
            </button>
          </span>
          {!separate && (
            <select aria-label={`Outcome for all ${cases.length} ${issueLabel(first)} cases`} value={same || ''} disabled={busy}
              onChange={event => pick(cases, event.target.value)}>
              <option value="">Choose outcome for all {cases.length}…</option>
              {choicesFor(first).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          )}
        </div>
        {!separate && same && <small>{helpFor(same, first)}</small>}
        {separate && <div className="ed-call-members">{cases.map(c => caseRow(c, caseDetail(c), true))}</div>}
      </div>
    );
  }

  const reason = problem();
  return (
    <div className="ed-call-outcome">
      <Dialog open={feedback.length > 0} onClose={finishFeedback}>
        {feedback[0] && <>
          <SatisfactionFeedback key={feedback[0].id} caseId={feedback[0].id} name={feedback[0].learner_name}
            employer={feedback[0].source_type === 'employer_feedback'} session={session}
            onSaved={() => (feedback.length > 1 ? setFeedback(feedback.slice(1)) : finishFeedback())} />
          <p className="ec-muted">The call is saved. If Zoom has not reported it yet, close this and complete the feedback from the case later.</p>
        </>}
      </Dialog>

      {open.length === 0 ? <p className="ec-tag">Every case on this call is already closed.</p> : (
        <fieldset className="ed-call-answer" disabled={busy}>
          <legend>Did {name} answer?</legend>
          <div className="ec-buttons">
            {ANSWERS.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={answer === value} className={answer === value ? 'primary' : undefined}
                onClick={() => setAnswer(value)}>{label}</button>
            ))}
          </div>
          {answer && !answered && <small>{WHOLE_CALL_HELP[answer]} This is saved for {open.length === 1 ? 'the case' : `all ${open.length} cases`}.</small>}
        </fieldset>
      )}

      {answered && (
        <section className="ed-call-cases" aria-label="Outcome of each case">
          <div className="ed-call-cases-head">
            <span>{open.length} {open.length === 1 ? 'case' : 'cases'} · {open.length - missing} of {open.length} recorded</span>
            {open.length > 1 && (
              <select aria-label="Set every case to" value="" disabled={busy} onChange={event => event.target.value && pickAll(event.target.value)}>
                <option value="">Set every case to…</option>
                <option value="agreed">Reached: each case’s first agreed action</option>
                <option value="callback">Callback requested</option>
                <option value="refused">Refused or problem</option>
                <option value={NOT_DISCUSSED}>Not discussed: keep it open</option>
              </select>
            )}
          </div>
          {groups.map(groupRow)}
        </section>
      )}
      {issues.filter(c => closed.has(c.id)).map(c => (
        <p key={c.id} className="ec-muted">{issueLabel(c)}: catch-up booked, case closed.</p>
      ))}

      {answer && (
        <>
          <label>{answer === 'no_answer' ? 'Note (optional)' : 'Notes / agreed action'}
            <textarea rows={3} maxLength={3500} placeholder={answer === 'no_answer' ? 'Anything to remember for the next call' : 'What was agreed? Who will do what, by when?'}
              value={note} onChange={event => setNote(event.target.value)} />
          </label>
          <label>{answer === 'callback' || open.some(c => choiceOf(c) === 'callback') ? 'Callback date and time (London)' : 'Follow-up (London time, optional)'}
            <input type="datetime-local" value={followUp} onChange={event => setFollowUp(event.target.value)} />
          </label>
          <div className="ed-quick-dates">
            {QUICK_FOLLOW_UPS.map(([days, label]) => (
              <button key={days} type="button" className="ed-sheet-link" title={`${longDate(workdayInput(days))} at 10:00 London`}
                onClick={() => setFollowUp(workdayInput(days))}>{label}</button>
            ))}
          </div>
          {followUp && <small>{closing ? 'These outcomes close every case, so the date is not used.' : `Back in the list ${longDate(followUp)}`}</small>}
        </>
      )}

      <div className="ed-call-save">
        {error ? <p className="ec-alert" role="alert">{error}</p> : reason && answer && <small role="status">{reason}</small>}
        <button type="button" className="primary ed-next-call" disabled={busy || (!answer && open.length > 0)} onClick={() => void save()}>
          {busy ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  );
}
