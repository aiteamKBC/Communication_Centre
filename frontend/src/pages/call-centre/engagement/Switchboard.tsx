import type { AgentStats } from '../api';
import type { Live } from './live';
import { clock, liveSeconds, since } from './live';
import { duration } from './model';

/** Talk time against the target in two colours: learner calls (with the call in progress) and Events hub calls. Both
 * count towards the target; the bar turns gold once it is met. */
export function TalkMeter({ seconds, eventSeconds, target, label, light = false }: {
  seconds: number; eventSeconds: number; target: number; label: string; light?: boolean;
}) {
  const share = (part: number) => (target ? Math.min(1, Math.max(0, part) / target) : 0);
  const learner = share(seconds - eventSeconds);
  const events = Math.min(share(eventSeconds), 1 - learner);
  const met = target > 0 && seconds >= target;
  return (
    <span className={`dd-meter${light ? ' light' : ''}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={target}
      aria-valuenow={seconds} aria-valuetext={`${duration(seconds)} of ${duration(target)}${eventSeconds ? `, ${duration(eventSeconds)} of it event calls` : ''}`}>
      <span className={`dd-meter-fill${met ? ' met' : ''}`} style={{ width: `${learner * 100}%` }} />
      {events > 0 && <span className="dd-meter-fill event" style={{ width: `${events * 100}%` }} />}
    </span>
  );
}

/** One line on the board: what the specialist is doing this minute, and today's talk time filling towards the target. */
export function Line({ agent, live, now, onOpen }: { agent: AgentStats; live: Live | null; now: number; onOpen?: (id: number) => void }) {
  const calls = (live?.calls || []).filter(call => call.agent_id === agent.id);
  const talking = calls.find(call => call.state === 'talking');
  const ringing = calls.find(call => call.state === 'ringing');
  const presence = live?.presence?.agents[String(agent.id)];
  const seconds = agent.today.seconds + liveSeconds(live?.calls, agent.id, now);
  const state = talking ? 'talking' : ringing ? 'ringing' : presence?.status === 'available' ? 'free' : 'off';
  const other = talking || ringing;
  const doing = talking
    ? `On a call · ${clock(since(talking.connected_at, now))}`
    : ringing ? (ringing.direction === 'inbound' ? 'Being rung' : 'Ringing out') : presence?.label || 'Status unknown';
  const body = (
    <>
      <span className={`dd-lamp ${state}`} aria-hidden="true" />
      <span className="dd-line-who">
        <strong>{agent.display_name}</strong>
        <span>{doing}{other && <> · {other.name || other.number}{other.role === 'line_manager' ? ' (line manager)' : ''}</>}</span>
      </span>
      <span className="dd-line-calls"><b>{agent.today.attempts}</b> calls<small>{agent.today.connected} answered</small></span>
      <TalkMeter seconds={seconds} eventSeconds={agent.today.event_seconds} target={agent.target_seconds}
        label={`${agent.display_name}: talk time today`} />
      <span className="dd-line-time"><b>{duration(seconds)}</b><small>of {duration(agent.target_seconds)}</small></span>
    </>
  );
  return (
    <li className={`dd-line ${state}`}>
      {onOpen ? <button type="button" onClick={() => onOpen(agent.id)} aria-label={`${agent.display_name}: open their page`}>{body}</button> : <div>{body}</div>}
    </li>
  );
}

/** The switchboard: every specialist as a line, live from Zoom (who is on a call, ringing, free or away), with today's
 * talk time against their target. Clicking a line opens that specialist's page. */
export default function Switchboard({ agents, live, now, onOpen, title = 'The board today' }: {
  agents: AgentStats[]; live: Live | null; now: number; onOpen?: (id: number) => void; title?: string;
}) {
  const shown = new Set(agents.map(agent => agent.id));
  const busy = (live?.calls || []).filter(call => call.agent_id !== null && shown.has(call.agent_id) && call.state === 'talking').length;
  const shared = agents.length > 1 ? (live?.calls || []).filter(call => call.agent_id === null) : [];
  return (
    <section className="dd-board" aria-label={title}>
      <header>
        <div>
          <h2>{title}</h2>
          <p>{live && !live.enabled ? 'Live status needs the Zoom webhook (Zoom Phone → Zoom accounts).'
            : `${busy} on a call now · live from Zoom`}</p>
        </div>
        <ul className="dd-board-key" aria-label="Key">
          <li><span className="dd-lamp talking" />On a call</li><li><span className="dd-lamp ringing" />Ringing</li>
          <li><span className="dd-lamp free" />Available</li><li><span className="dd-lamp off" />Away or offline</li>
          <li><span className="dd-key-bar" />Learner calls</li><li><span className="dd-key-bar event" />Event calls</li>
        </ul>
      </header>
      <ol className="dd-lines">
        {agents.map(agent => <Line key={agent.id} agent={agent} live={live} now={now} onOpen={onOpen} />)}
        {!agents.length && <li className="dd-line-empty">No active specialists yet. Add one under Zoom Phone.</li>}
      </ol>
      {shared.length > 0 && (
        <p className="dd-board-shared">Shared line: {shared.map(call => `${call.name || call.number} (${call.state === 'talking' ? 'on a call' : 'ringing'})`).join(', ')}</p>
      )}
      {live?.presence?.error && <p className="dd-board-shared">Zoom status: {live.presence.error}</p>}
    </section>
  );
}
