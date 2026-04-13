/**
 * Thin wrapper kept for backwards-compatibility so every existing import of
 * useSharedEvents continues to work without changes.  All state and fetching
 * now lives in EventsContext (mounted once in App.tsx) so every consumer —
 * the Events page, the Home widget, etc. — shares the exact same data and
 * any mutation (addEvent) is immediately visible everywhere.
 */
export { useEventsContext as useSharedEvents } from '../contexts/EventsContext';
