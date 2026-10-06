import { useEffect, useState } from 'react';
import { downloadText, request, transcriptStatusLabels } from '../api';
import Dialog from './Dialog';

type Recording = { id: number; recording_type: string; owner_name: string; duration_seconds: number | null; transcript_status: string; transcript_error: string };
type Transcript = { status: string; text: string; error: string };

/** Recordings for one Zoom call and the selected transcript (managers or the agent on the call). */
export default function RecordingDialog({ callId, onClose }: { callId: number | null; onClose: () => void }) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setRecordings([]);
    setSelected(null);
    setError('');
    if (callId === null) return undefined;
    const controller = new AbortController();
    setLoading(true);
    request<{ recordings: Recording[] }>(`/api/zoom/calls/${callId}/recordings/`, { signal: controller.signal })
      .then(data => {
        setRecordings(data.recordings);
        setSelected(data.recordings.find(row => row.transcript_status === 'ready')?.id ?? null);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [callId]);

  useEffect(() => {
    setTranscript(null);
    if (selected === null) return undefined;
    const controller = new AbortController();
    request<Transcript>(`/api/zoom/recordings/${selected}/transcript/`, { signal: controller.signal })
      .then(setTranscript)
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [selected]);

  return (
    <Dialog open={callId !== null} onClose={onClose}>
      <h2>Call recording and transcript</h2>
      {error && <p className="ec-status danger" role="alert">{error}</p>}
      {loading ? <p role="status">Loading recordings…</p> : !recordings.length && !error ? <p className="ec-muted">No recordings have been synced for this call.</p> : (
        <div className="ec-table-wrap">
          <table>
            <thead><tr><th>Recording</th><th>Transcript</th><th /></tr></thead>
            <tbody>
              {recordings.map(row => (
                <tr key={row.id}>
                  <td>{row.owner_name || 'Recording'}<small>{row.recording_type || 'Call recording'} · {row.duration_seconds === null ? 'Duration not supplied' : `${row.duration_seconds} seconds`}</small></td>
                  <td>{transcriptStatusLabels[row.transcript_status] || row.transcript_status}{row.transcript_error && <small>{row.transcript_error}</small>}</td>
                  <td><button type="button" disabled={row.transcript_status !== 'ready'} aria-pressed={selected === row.id} onClick={() => setSelected(row.id)}>Read transcript</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {transcript && (
        <>
          <div className="ec-head" style={{ marginTop: '1rem' }}>
            <h3>Call transcript</h3>
            <button type="button" disabled={!transcript.text} onClick={() => downloadText(transcript.text, `zoom-transcript-${selected}.txt`)}>Download text</button>
          </div>
          {transcript.status === 'ready' ? <pre style={{ whiteSpace: 'pre-wrap' }}>{transcript.text}</pre> : <p>The transcript is pending. Check Zoom transcription settings and allow processing time.</p>}
        </>
      )}
    </Dialog>
  );
}
