import { useCallback, useEffect, useState } from 'react';
import { api, post } from '../api';

type Row = { coach: string; email: string; slug: string; source: '' | 'catalogue' | 'confirmed'; page_found: boolean; suggestion: string };
type Data = { coaches: Row[]; pages: { slug: string; name: string }[]; set_up: boolean; not_set_up: string; directory_readable: boolean };

const UNSET = '__unset';
const NO_PAGE = '';
const errorText = (reason: unknown) => (reason instanceof Error ? reason.message : 'Something went wrong. Try again.');

function status(row: Row, chosen: string) {
  if (!row.email) return 'No coach email in the enrolment records, so no page can be linked';
  if (row.source && !row.page_found) return 'This page is no longer in the LMS coach directory';
  if (row.source === 'confirmed') return row.slug ? 'Linked' : 'Confirmed: no booking page';
  if (row.source === 'catalogue') return 'Linked from the original catalogue';
  if (row.suggestion && chosen === row.suggestion) return 'Suggested by name: confirm to use it';
  return 'Not linked';
}

/** Directors link each coach to their page in the LMS coach directory (only read). The links then follow that page. */
export default function CoachPages({ csrf, onSaved }: { csrf: string; onSaved: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    try {
      const value = await api<Data>('coach-pages/');
      setData(value);
      setChosen(Object.fromEntries(value.coaches.map(row => [row.email, row.source ? row.slug : row.suggestion || UNSET])));
      setError('');
    } catch (reason) {
      setError(errorText(reason));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function confirm(row: Row) {
    const slug = chosen[row.email];
    if (busy || slug === UNSET) return;
    setBusy(row.email); setError(''); setSaved('');
    try {
      await post('coach-pages/', csrf, { email: row.email, slug });
      setSaved(`${row.coach}: ${slug ? 'booking page linked' : 'no booking page'}.`);
      await load();
      onSaved();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy('');
    }
  }

  if (!data) {
    return <section className="ec-card" style={{ marginTop: '1rem' }}>{error ? <p className="ec-alert" role="alert">{error}</p> : <p role="status">Loading coach booking pages…</p>}</section>;
  }
  return (
    <section className="ec-card" style={{ marginTop: '1rem' }}>
      <h2>Link LMS booking pages</h2>
      <p className="ec-muted">Choose each coach’s page in the LMS Coach directory once. Their links then follow that page: changes made in the LMS appear here within a minute. The LMS is only read.</p>
      {!data.set_up && <p className="ec-alert">{data.not_set_up}</p>}
      {!data.directory_readable && <p className="ec-alert">The LMS Coach directory cannot be read right now, so the original catalogue links are shown and pages cannot be linked.</p>}
      {error && <p className="ec-alert" role="alert">{error}</p>}
      <div className="ec-status" role="status" aria-live="polite">{saved}</div>
      <div className="ec-table-wrap">
        <table>
          <thead><tr><th>Coach</th><th>LMS booking page</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data.coaches.map(row => {
              const value = chosen[row.email] ?? UNSET;
              const unchanged = row.source === 'confirmed' && value === row.slug;
              const locked = !row.email || !data.set_up || !data.directory_readable;
              return (
                <tr key={row.coach}>
                  <td><strong>{row.coach}</strong><small>{row.email || 'No email recorded'}</small></td>
                  <td>
                    <select aria-label={`LMS booking page for ${row.coach}`} value={value} disabled={locked || !!busy}
                      onChange={event => { setChosen({ ...chosen, [row.email]: event.target.value }); setSaved(''); }}>
                      {value === UNSET && <option value={UNSET}>Choose a page…</option>}
                      {row.source && !row.page_found && <option value={row.slug}>{row.slug} (not in the directory)</option>}
                      {data.pages.map(page => <option key={page.slug} value={page.slug}>{page.name} · /{page.slug}</option>)}
                      <option value={NO_PAGE}>No booking page</option>
                    </select>
                  </td>
                  <td>{status(row, value)}</td>
                  <td>
                    <button type="button" className="primary" disabled={locked || !!busy || value === UNSET || unchanged} onClick={() => void confirm(row)}>
                      {busy === row.email ? 'Saving…' : 'Confirm'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!data.coaches.length && <tr><td colSpan={4}>No coaches in the current register.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
