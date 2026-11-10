import { useEffect, useState } from 'react';
import { downloadText, request, transcriptStatusLabels } from '../api';
import type { CallReview } from '../api';
import CallReviewPanel from './CallReview';
import { human } from './model';

type Transcript = { status: string; text: string; error: string; review: CallReview | null };

/** One recording's transcript and the AI's review of the call, loaded when opened. */
export default function TranscriptPanel({ recordingId, state, label }: { recordingId: number; state: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Transcript | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || data) return undefined;
    const controller = new AbortController();
    request<Transcript>(`/api/zoom/recordings/${recordingId}/transcript/`, { signal: controller.signal })
      .then(setData)
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The transcript could not load.'); });
    return () => controller.abort();
  }, [open, data, recordingId]);
  return (
    <details className="cl-transcript" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>{label} <small>{transcriptStatusLabels[state] || human(state)}</small></summary>
      {error && <p className="ec-status danger" role="alert">{error}</p>}
      {open && !data && !error && <p role="status">Loading the transcript…</p>}
      {data && (
        <>
          <CallReviewPanel review={data.review} />
          {data.status === 'ready' ? (
            <>
              <pre>{data.text}</pre>
              <button type="button" onClick={() => downloadText(data.text, `zoom-transcript-${recordingId}.txt`)}>Download text</button>
            </>
          ) : <p className="ec-muted">The transcript is not ready yet. Zoom usually takes a few minutes after the call.</p>}
        </>
      )}
    </details>
  );
}
