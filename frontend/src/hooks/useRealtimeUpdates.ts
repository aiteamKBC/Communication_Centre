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
const REALTIME_STATUS_EVENT_NAME = 'kbc:realtime-status';
const FALLBACK_POLL_MS = 60000;
const SSE_RETRY_MS = 60000;
const SSE_OPEN_DELAY_MS = 5000;
const SSE_FIRST_MESSAGE_TIMEOUT_MS = 8000;

type RealtimeOptions = {
  enabled?: boolean;
};

type RealtimeStatusDetail = {
  mode: 'sse' | 'fallback';
};

function changedResources(previous: RealtimePayload | null, next: RealtimePayload): string[] {
  if (!previous) return [];
  return Object.keys(next.resources).filter(resource => previous.resources[resource] !== next.resources[resource]);
}

function parseRealtimePayload(raw: string): RealtimePayload | null {
  try {
    const payload = JSON.parse(raw) as Partial<RealtimePayload>;
    if (
      typeof payload.version !== 'number'
      || !payload.resources
      || typeof payload.resources !== 'object'
    ) {
      return null;
    }
    return {
      version: payload.version,
      resources: Object.fromEntries(
        Object.entries(payload.resources).filter(([, value]) => typeof value === 'number'),
      ),
      serverTime: typeof payload.serverTime === 'string' ? payload.serverTime : undefined,
    };
  } catch {
    return null;
  }
}

function emitRealtimeUpdate(payload: RealtimePayload, resources: string[]) {
  if (!resources.length) return;
  window.dispatchEvent(new CustomEvent<RealtimeUpdateDetail>(REALTIME_EVENT_NAME, {
    detail: { payload, changedResources: resources },
  }));
}

function emitRealtimeStatus(mode: RealtimeStatusDetail['mode']) {
  window.dispatchEvent(new CustomEvent<RealtimeStatusDetail>(REALTIME_STATUS_EVENT_NAME, {
    detail: { mode },
  }));
}

export function useRealtimeUpdates({ enabled = true }: RealtimeOptions = {}) {
  const lastPayloadRef = useRef<RealtimePayload | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      controllerRef.current?.abort();
      controllerRef.current = null;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      lastPayloadRef.current = null;
      return;
    }

    let timer: number | undefined;
    let retryTimer: number | undefined;
    let openTimer: number | undefined;
    let firstMessageTimer: number | undefined;
    let stopped = false;
    let fallbackEnabled = false;

    const applyPayload = (payload: RealtimePayload) => {
      const resources = changedResources(lastPayloadRef.current, payload);
      lastPayloadRef.current = payload;
      emitRealtimeUpdate(payload, resources);
    };

    const scheduleFallback = () => {
      if (stopped || !fallbackEnabled) return;
      timer = window.setTimeout(poll, FALLBACK_POLL_MS);
    };

    const poll = async () => {
      if (stopped || !fallbackEnabled) return;
      if (document.visibilityState !== 'visible') {
        scheduleFallback();
        return;
      }
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const response = await fetch('/api/realtime/', { cache: 'no-store', signal: controller.signal });
        if (response.status === 401 || response.status === 403) {
          stopped = true;
          return;
        }
        if (!response.ok) return;
        applyPayload((await response.json()) as RealtimePayload);
      } catch (error) {
        if (stopped || (error instanceof DOMException && error.name === 'AbortError')) return;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
        scheduleFallback();
      }
    };

    const startFallback = () => {
      if (stopped || fallbackEnabled) return;
      fallbackEnabled = true;
      emitRealtimeStatus('fallback');
      void poll();
    };

    const openSse = () => {
      if (stopped || eventSourceRef.current) return;
      const source = new EventSource('/api/realtime/?stream=1');
      eventSourceRef.current = source;
      firstMessageTimer = window.setTimeout(() => {
        if (eventSourceRef.current !== source) return;
        source.close();
        eventSourceRef.current = null;
        startFallback();
        if (!stopped && retryTimer === undefined) {
          retryTimer = window.setTimeout(() => {
            retryTimer = undefined;
            fallbackEnabled = false;
            openSse();
          }, SSE_RETRY_MS);
        }
      }, SSE_FIRST_MESSAGE_TIMEOUT_MS);

      const handlePayloadEvent = (event: MessageEvent<string>) => {
        const payload = parseRealtimePayload(event.data);
        if (!payload) return;
        if (firstMessageTimer !== undefined) {
          window.clearTimeout(firstMessageTimer);
          firstMessageTimer = undefined;
        }
        fallbackEnabled = false;
        if (timer !== undefined) window.clearTimeout(timer);
        emitRealtimeStatus('sse');
        applyPayload(payload);
      };
      const handleNamedPayloadEvent = (event: Event) => handlePayloadEvent(event as MessageEvent<string>);

      source.onmessage = handlePayloadEvent;
      source.addEventListener('snapshot', handleNamedPayloadEvent);
      source.addEventListener('update', handleNamedPayloadEvent);
      source.onerror = () => {
        if (eventSourceRef.current === source) {
          source.close();
          eventSourceRef.current = null;
        }
        if (firstMessageTimer !== undefined) {
          window.clearTimeout(firstMessageTimer);
          firstMessageTimer = undefined;
        }
        startFallback();
        if (!stopped && retryTimer === undefined) {
          retryTimer = window.setTimeout(() => {
            retryTimer = undefined;
            fallbackEnabled = false;
            openSse();
          }, SSE_RETRY_MS);
        }
      };
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && fallbackEnabled) {
        void poll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    openTimer = window.setTimeout(openSse, SSE_OPEN_DELAY_MS);

    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (openTimer !== undefined) window.clearTimeout(openTimer);
      if (firstMessageTimer !== undefined) window.clearTimeout(firstMessageTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      controllerRef.current?.abort();
      controllerRef.current = null;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [enabled]);
}

export function useRealtimeResource(resource: string | string[], onChange: (detail?: RealtimeUpdateDetail) => void | Promise<void>) {
  const onChangeRef = useRef(onChange);
  const resourceKey = Array.isArray(resource) ? resource.join('|') : resource;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const resources = resourceKey.split('|');
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<RealtimeUpdateDetail>).detail;
      if (!detail?.changedResources?.some(changedResource => resources.includes(changedResource))) return;
      void onChangeRef.current(detail);
    };

    window.addEventListener(REALTIME_EVENT_NAME, handler);
    return () => window.removeEventListener(REALTIME_EVENT_NAME, handler);
  }, [resourceKey]);
}

export function useRealtimeStatus(onChange: (mode: RealtimeStatusDetail['mode']) => void) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<RealtimeStatusDetail>).detail;
      if (detail?.mode) onChangeRef.current(detail.mode);
    };

    window.addEventListener(REALTIME_STATUS_EVENT_NAME, handler);
    return () => window.removeEventListener(REALTIME_STATUS_EVENT_NAME, handler);
  }, []);
}
