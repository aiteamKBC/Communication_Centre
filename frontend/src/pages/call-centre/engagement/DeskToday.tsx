import { useState } from 'react';
import type { AgentStats, Overview } from '../api';
import type { Session } from './actions';
import { ROLES, waited } from './inbound';
import type { InboundItem, InboundListing } from './inbound';
import type { Live } from './live';
import { liveSeconds } from './live';
import { TASK, listCount, listLabel, points, ratedCalls, taskKey, taskLabel, when } from './model';
import NextCall from './NextCall';
import { Line } from './Switchboard';

type Props = {
  overview: Overview; agent: AgentStats | undefined; session: Session; live: Live | null; now: number;
  rang: InboundListing | null; lists: string[]; onSection: (key: string) => void; onOpen: (id: number) => void;
  onRefresh: () => void; notify: (message: string, error?: boolean) => void;
};

// Enough call-backs to act on from the home page; the rest wait in Missed calls.
const RANG_SHOWN = 4;

/** The specialist's own line, live from Zoom: what they are doing now, calls and talk time against target. */
function MyLine({ agent, overview, live, now, agentId }: { agent: AgentStats; overview: Overview; live: Live | null; now: number; agentId: number | null }) {
  const today = { ...agent.today, seconds: agent.today.seconds + liveSeconds(live?.calls, agentId, now) };
  const reviews = overview.call_reviews?.agents[agent.id];
  return (
    <section className="dd-board dk-line" aria-label="Your line">
      <ol className="dd-lines"><Line agent={agent} live={live} now={now} /></ol>
      <p className="dk-line-foot">
        <span>Points today <b>{points(today, agent.target_seconds)}</b> of 300</span>
        <span>Call quality this month {reviews && ratedCalls(reviews)
          ? <><b>{reviews.excellent}</b> excellent · <b>{reviews.good}</b> good · <b>{reviews.bad}</b> bad</>
          : <b>not scored yet</b>}</span>
        {live && !live.enabled && <span>Live status needs the Zoom webhook: ask a manager.</span>}
      </p>
    </section>
  );
}

/** One person who rang and was missed: who, how long they have waited, what their voicemail said, and their case. */
function RangCard({ item, onOpen, onAll }: { item: InboundItem; onOpen: (id: number) => void; onAll: () => void }) {
  const [playing, setPlaying] = useState(false);
  const transcript = item.voicemail?.transcript;
  return (
    <article className={`dk-rang-card${item.waited_minutes > 240 ? ' long' : ''}`}>
      <header>
        <strong>{item.caller_name || item.caller_number}</strong>
        <span title={when(item.received_at)}>{ROLES[item.caller_role] || 'Caller'} · rang {waited(item.waited_minutes)} ago</span>
      </header>
      {item.voicemail && item.voicemail_id ? (
        <div className="dk-rang-voicemail">
          {transcript ? <blockquote title={transcript}><q>{transcript}</q></blockquote>
            : <p>{item.voicemail.transcript_status === 'pending' ? 'Voicemail left · transcript on its way' : 'Voicemail left · no transcript'}</p>}
          {playing
            ? <audio controls autoPlay src={`/api/callcentre/voicemails/${item.voicemail_id}/audio/`} aria-label={`Voicemail from ${item.caller_name || item.caller_number}`} />
            : <button type="button" className="dk-play" onClick={() => setPlaying(true)}>▶ Play{item.voicemail.duration_seconds ? ` (${item.voicemail.duration_seconds} s)` : ''}</button>}
        </div>
      ) : <p className="dk-rang-none">No voicemail</p>}
      {item.case_id
        ? <button type="button" className="primary" onClick={() => onOpen(item.case_id!)}>Open case to call back</button>
        : <button type="button" onClick={onAll}>See in Missed calls</button>}
    </article>
  );
}

/** The desk's home page: your line, who rang and is waiting for you, the next person to call, and your lists. */
export default function DeskToday({ overview, agent, session, live, now, rang, lists, onSection, onOpen, onRefresh, notify }: Props) {
  const waiting = (rang?.items || []).filter(item => item.status === 'open');
  const open = rang?.summary?.open ?? waiting.length;
  // Tasks the director gave this desk that it has not opened yet.
  const fresh = (overview.tasks || []).filter(task => task.to_agent_id === session.agentId && !task.seen_at);
  const placed = (after: string) => (after ? `after your ${listLabel(after, overview.tasks)}` : 'first on your list');
  return (
    <div className="dk">
      {fresh.length > 0 && (
        <section className="dk-new-tasks" aria-label="New tasks from the director">
          {fresh.map(task => (
            <p key={task.id}>
              <strong>New task from the director:</strong> {listCount(overview, taskKey(task), session.agentId)} of {taskLabel(task)}
              {task.catch_new ? ' (and its new learners)' : ''}, {placed(task.after_topic)}.
              <button type="button" className="primary" onClick={() => onSection(taskKey(task))}>Open</button>
            </p>
          ))}
        </section>
      )}
      {agent && <MyLine agent={agent} overview={overview} live={live} now={now} agentId={session.agentId} />}

      {rang && (
        <section className="dk-section" aria-labelledby="dk-rang">
          <header className="dk-section-head">
            <div><p className="dd-eyebrow">Rang you{open ? ` · ${open} waiting` : ''}</p><h2 id="dk-rang">{open ? 'Call them back first' : 'Nobody is waiting for a call back'}</h2></div>
            {open > 0 && <button type="button" onClick={() => onSection('rang')}>All missed calls</button>}
          </header>
          {waiting.length > 0 && (
            <div className="dk-rang">
              {waiting.slice(0, RANG_SHOWN).map(item => <RangCard key={item.id} item={item} onOpen={onOpen} onAll={() => onSection('rang')} />)}
            </div>
          )}
        </section>
      )}

      <section className="dk-section" aria-labelledby="dk-next">
        <header className="dk-section-head">
          <div><p className="dd-eyebrow">One conversation at a time</p><h2 id="dk-next">Call next</h2></div>
        </header>
        {/* List by list, in the order of the lists below: the director sees which list each specialist is on. */}
        <NextCall overview={overview} session={session} onRefresh={onRefresh} notify={notify} onOpen={onOpen} topics={lists} />
      </section>

      <section className="dk-section" aria-labelledby="dk-lists">
        <header className="dk-section-head">
          <div><p className="dd-eyebrow">Everyone to call, by reason</p><h2 id="dk-lists">Your lists</h2></div>
        </header>
        <div className="dk-tiles">
          {lists.map(key => {
            const count = listCount(overview, key, session.agentId);
            const label = listLabel(key, overview.tasks);
            return (
              <button key={key} type="button" className={`dk-tile${count ? '' : ' empty'}${key.startsWith(TASK) ? ' task' : ''}`} onClick={() => onSection(key)}
                aria-label={`${label}: ${count} ${count === 1 ? 'person' : 'people'}`}>
                <b>{count}</b><span>{label}</span>{key.startsWith(TASK) && <small>Covering</small>}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
