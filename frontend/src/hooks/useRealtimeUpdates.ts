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
const BASE_POLL_MS = 10000;
const MAX_POLL_MS = 60000;

type RealtimeOptions = {
  enabled?: boolean;
};

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

export function useRealtimeUpdates({ enabled = true }: RealtimeOptions = {}) {
  const lastPayloadRef = useRef<RealtimePayload | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      controllerRef.current?.abort();
      controllerRef.current = null;
      lastPayloadRef.current = null;
      return;
    }

    let timer: number | undefined;
    let stopped = false;
    let delayMs = BASE_POLL_MS;

    const applyPayload = (payload: RealtimePayload) => {
      const resources = changedResources(lastPayloadRef.current, payload);
      lastPayloadRef.current = payload;
      emitRealtimeUpdate(payload, resources);
    };

    const scheduleNext = () => {
      if (stopped) return;
      timer = window.setTimeout(poll, delayMs);
    };

    const poll = async () => {
      if (stopped) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const response = await fetch('/api/realtime/', { signal: controller.signal });
        if (response.status === 401 || response.status === 403) {
          stopped = true;
          return;
        }
        if (!response.ok) {
          delayMs = Math.min(delayMs * 2, MAX_POLL_MS);
          return;
        }
        applyPayload((await response.json()) as RealtimePayload);
        delayMs = BASE_POLL_MS;
      } catch (error) {
        if (!stopped && !(error instanceof DOMException && error.name === 'AbortError')) {
          delayMs = Math.min(delayMs * 2, MAX_POLL_MS);
        }
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
        scheduleNext();
      }
    };

    void poll();

    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [enabled]);
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
