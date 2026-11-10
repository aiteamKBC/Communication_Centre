import { useEffect, useState } from 'react';
import { api } from '../api';

/** Calls ringing or in progress, and each specialist's Zoom status, from Zoom's webhooks (live/). */
export type LiveCall = {
  call_id: string; agent_id: number | null; agent: string; direction: 'outbound' | 'inbound'; state: 'ringing' | 'talking';
  line: string; number: string; name: string; role: string; email: string; case_id: number | null; started_at: string; connected_at?: string;
};
export type Presence = { agents: Record<string, { status: string; label: string; at: string; source: string }>; error: string };
export type Live = { enabled: boolean; calls: LiveCall[]; presence?: Presence };

export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
export const since = (iso: string | undefined, now: number) => (iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 1000)) : 0);

/** Calls ringing or in progress, from Zoom's webhooks: asked every few seconds while the page is visible (and enabled). */
export function useLive(every = 5000, enabled = true) {
  const [live, setLive] = useState<Live | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      api<Live>('live/').then(value => { if (!stopped) setLive(value); }).catch(() => undefined);
    };
    load();
    const asking = window.setInterval(load, every);
    const ticking = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { stopped = true; window.clearInterval(asking); window.clearInterval(ticking); };
  }, [every, enabled]);
  return { live, now };
}

/** Seconds of the specialist's call in progress (talking), for the day's talk time. */
export const liveSeconds = (calls: LiveCall[] | undefined, agentId: number | null | undefined, now: number) =>
  (calls || []).filter(call => call.agent_id === agentId && call.state === 'talking').reduce((total, call) => total + since(call.connected_at, now), 0);

