import { useEffect, useState } from 'react';
import { accountLabel, downloadText, request, transcriptStatusLabels } from '../api';
import Dialog from './Dialog';
import { when } from './model';

type Summary = { total: number; ready: number; pending: number; disabled: number; unavailable: number; error: number };
type Row = { id: number; source_account: string; recording_type: string; owner_name: string; started_at: string; duration_seconds: number | null; transcript_status: string; transcript_error: string; preview: string };
type Report = { summary: Summary; accounts: (Summary & { key: string; label: string })[]; records: Row[]; total_records: number; has_next: boolean };
type Transcript = { id: number; status: string; text: string; error: string };

/** Manager-only overview of every synced transcript in the date range. */
export default function TranscriptsDialog({ open, onClose, from, to }: { open: boolean; onClose: () => void; from: string; to: string }) {
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<Report | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setPage(1);
    setSelected(null);
  }, [from, to, status, open]);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setError('');
    request<Report>(`/api/zoom/transcripts/?${new URLSearchParams({ from, to, account: 'all', status, page: String(page), page_size: '25' })}`, { signal: controller.signal })
      .then(setReport)
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [open, from, to, status, page]);

  useEffect(() => {
    setTranscript(null);
    if (!open || selected === null) return undefined;
    const controller = new AbortController();
    request<Transcript>(`/api/zoom/recordings/${selected}/transcript/`, { signal: controller.signal })
      .then(setTranscript)
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [open, selected]);

  return (
    <Dialog open={open} onClose={onClose}>
      <h2>All transcripts</h2>
      <p className="ec-muted">{from} to {to} · both Zoom accounts · {report?.summary.total ?? 0} recordings, {report?.summary.ready ?? 0} transcripts ready</p>
      <div className="ec-tools">
        <select aria-label="Transcript status" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          {Object.entries(transcriptStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {report?.accounts.map(account => <span key={account.key} className="ec-tag">{account.label}: {account.ready} of {account.total} ready</span>)}
      </div>
      {error && <p className="ec-status danger" role="alert">{error}</p>}
      <div className="ec-table-wrap">
        <table>
          <thead><tr><th>Recorded</th><th>Specialist</th><th>Transcript</th><th /></tr></thead>
          <tbody>
            {report?.records.map(row => (
              <tr key={row.id}>
                <td>{when(row.started_at)}<small>{accountLabel(row.source_account)}</small></td>
                <td>{row.owner_name || 'Zoom recording'}{row.preview && <small>{row.preview}</small>}</td>
                <td>{transcriptStatusLabels[row.transcript_status] || row.transcript_status}{row.transcript_error && <small>{row.transcript_error}</small>}</td>
                <td><button type="button" disabled={row.transcript_status !== 'ready'} onClick={() => setSelected(row.id)}>Read</button></td>
              </tr>
            ))}
            {!report?.records.length && <tr><td colSpan={4}>No transcripts match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="ec-buttons">
        <button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous page</button>
        <span>Page {page} · {report?.total_records ?? 0} results</span>
        <button type="button" disabled={!report?.has_next} onClick={() => setPage(value => value + 1)}>Next page</button>
      </div>
      {transcript && (
        <>
          <div className="ec-head" style={{ marginTop: '1rem' }}>
            <h3>Call transcript</h3>
            <button type="button" disabled={!transcript.text} onClick={() => downloadText(transcript.text, `zoom-transcript-${transcript.id}.txt`)}>Download text</button>
          </div>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{transcript.text || transcript.error || 'The transcript is empty.'}</pre>
        </>
      )}
    </Dialog>
  );
}
