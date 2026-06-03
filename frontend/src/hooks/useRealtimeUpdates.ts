import { useEffect, useRef } from 'react';

type RealtimePayload = {
  version: number;
  resources: Record<string, number>;
  serverTime?: string;
};

export type RealtimeUpdateDetail = {
  payload: RealtimePayload;
  changedResources: string[];
};

const REALTIME_EVENT_NAME = 'kbc:realtime-update';

function parsePayload(event: MessageEvent): RealtimePayload | null {
  try {
    const payload = JSON.parse(event.data) as RealtimePayload;
    if (!payload || typeof payload.version !== 'number' || !payload.resources) return null;
    return payload;
  } catch {
    return null;
  }
}

function changedResources(previous: RealtimePayload | null, next: RealtimePayload): string[] {
  if (!previous) return [];
  return Object.keys(next.resources).filter(resource => previous.resources[resource] !== next.resources[resource]);
}

function emitRealtimeUpdate(payload: RealtimePayload, resources: string[]) {
  if (!resources.length) return;
  window.dispatchEvent(new CustomEvent<RealtimeUpdateDetail>(REALTIME_EVENT_NAME, {
    detail: { payload, changedResources: resources },
  }));
}

export function useRealtimeUpdates() {
  const lastPayloadRef = useRef<RealtimePayload | null>(null);

  useEffect(() => {
    let pollTimer: number | undefined;
    let stopped = false;

    const applyPayload = (payload: RealtimePayload) => {
      const resources = changedResources(lastPayloadRef.current, payload);
      lastPayloadRef.current = payload;
      emitRealtimeUpdate(payload, resources);
    };

    const startPollingFallback = () => {
      if (pollTimer !== undefined) return;
      const poll = async () => {
        if (stopped) return;
        try {
          const response = await fetch('/api/realtime/');
          if (!response.ok) return;
          applyPayload((await response.json()) as RealtimePayload);
        } catch {
          // Keep retrying quietly.
        }
      };
      void poll();
      pollTimer = window.setInterval(poll, 5000);
    };

    if (!('EventSource' in window)) {
      startPollingFallback();
      return () => {
        stopped = true;
        if (pollTimer !== undefined) window.clearInterval(pollTimer);
      };
    }

    const source = new EventSource('/api/realtime/?stream=1');
    const handleMessage = (event: MessageEvent) => {
      const payload = parsePayload(event);
      if (payload) applyPayload(payload);
    };

    source.addEventListener('snapshot', handleMessage);
    source.addEventListener('update', handleMessage);
    source.onerror = () => {
      source.close();
      startPollingFallback();
    };

    return () => {
      stopped = true;
      source.close();
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
    };
  }, []);
}

export function useRealtimeResource(resource: string, onChange: () => void | Promise<void>) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<RealtimeUpdateDetail>).detail;
      if (!detail?.changedResources?.includes(resource)) return;
      void onChangeRef.current();
    };

    window.addEventListener(REALTIME_EVENT_NAME, handler);
    return () => window.removeEventListener(REALTIME_EVENT_NAME, handler);
  }, [resource]);
}
