import { useState } from 'react';
import { useCallCentre } from '../api';
import { clock, since } from './live';
import type { Live } from './live';
import { when } from './model';

/** A learner ringing the specialist: a banner that opens their case over the page. It never replaces what is on screen
 * (not while another case is open), and stays hidden while the specialist is on another call. */
export function IncomingBanner({ live, now, agentId, busy, onOpen }: {
  live: Live | null; now: number; agentId: number | null; busy: boolean; onOpen: (id: number) => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const mine = (live?.calls || []).filter(call => call.agent_id === agentId);
  if (mine.some(call => call.direction === 'outbound')) return null;
  const incoming = mine.filter(call => call.direction === 'inbound' && !dismissed.has(call.call_id));
  if (!incoming.length) return null;
  return (
    <div className="ec-alert ed-incoming" role="status" aria-live="polite">
      {incoming.map(call => (
        <div key={call.call_id} className="ec-buttons">
          <strong>{call.name || call.number} {call.state === 'talking' ? `is on the line (${clock(since(call.connected_at, now))})` : 'is calling you'}</strong>
          <span className="ec-muted">{call.name ? call.number : 'Not a number we know'}{call.role === 'line_manager' ? ' · line manager' : ''}</span>
          {call.case_id && (busy
            ? <span className="ec-muted">Close the case you have open to see theirs (nothing you typed is lost until then).</span>
            : <button type="button" className="primary" onClick={() => onOpen(call.case_id!)}>Open their case</button>)}
          <button type="button" onClick={() => setDismissed(current => new Set(current).add(call.call_id))}>Hide</button>
        </div>
      ))}
    </div>
  );
}

type Change = { number: string; account: string; what: string; serious: boolean; specialists?: string[]; at: string };

/** What changed in Zoom on the team's numbers (checked hourly, sooner when a webhook says something changed). */
export function ZoomChanges({ seriousOnly = false }: { seriousOnly?: boolean }) {
  const [days, setDays] = useState(seriousOnly ? 7 : 30);
  const { data, error } = useCallCentre<{ changes: Change[]; checked_at: string | null }>(`zoom-changes/?days=${days}`);
  const changes = (data?.changes || []).filter(change => !seriousOnly || change.serious);
  if (seriousOnly && !changes.length) return null;
  return (
    <section className="ec-card" aria-label="Changes in Zoom" style={seriousOnly ? { marginBottom: '1.2rem' } : undefined}>
      <div className="ec-head">
        <div>
          <h2>{seriousOnly ? 'Changes in Zoom to check' : 'Changes in Zoom'}</h2>
          <p className="ec-muted">Numbers added or removed, given to someone else, renamed, or with automatic recording switched on or off. In red: a
            change that can stop calls being matched to a specialist or recorded.{data?.checked_at ? ` Last checked ${when(data.checked_at)}.` : ' Not checked yet.'}</p>
        </div>
        {!seriousOnly && (
          <label>Period
            <select value={days} onChange={event => setDays(Number(event.target.value))}>
              <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
            </select>
          </label>
        )}
      </div>
      {error && <p className="ec-alert" role="alert">{error}</p>}
      <div className="ec-table-wrap">
        <table>
          <thead><tr><th>When</th><th>Number</th><th>What changed</th></tr></thead>
          <tbody>
            {changes.map(change => (
              <tr key={`${change.at}-${change.number}-${change.what}`}>
                <td>{when(change.at)}</td>
                <td>{change.number}<small>{change.account}{change.specialists?.length ? ` · ${change.specialists.join(', ')}` : ''}</small></td>
                <td className={change.serious ? 'danger' : undefined}>{change.what}</td>
              </tr>
            ))}
            {data && !changes.length && <tr><td colSpan={3}>No changes in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
