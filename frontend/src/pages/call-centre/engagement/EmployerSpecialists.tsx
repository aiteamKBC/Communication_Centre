import { useCallback, useEffect, useState } from 'react';
import { api, post } from '../api';
import type { Session } from './actions';
import { when } from './model';

type Values = { enabled: boolean; agent_ids: number[] };
type Data = {
  values: Values; revision: number; set_up: boolean; not_set_up: string; open_employer_cases: number;
  agents: { id: number; display_name: string; allocated_learners: number }[];
  history: { id: number; value: Values; reason: string; actor: string; created_at: string }[];
};

/** Director overview card: hand every employer satisfaction call to chosen specialists, who then call employers only. */
export default function EmployerSpecialists({ session, onChanged, notify }: {
  session: Session; onChanged: () => void; notify: (message: string, error?: boolean) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<Values>({ enabled: false, agent_ids: [] });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Data>('employer-specialists/')
      .then(result => {
        setData(result);
        setForm(result.values);
        setError('');
      })
      .catch(failure => setError(failure instanceof Error ? failure.message : 'The employer specialists could not load.'));
  }, []);
  useEffect(load, [load]);

  async function save() {
    if (!data) return;
    setBusy(true);
    setError('');
    try {
      await post('employer-specialists/', session.csrf, { values: form, revision: data.revision, reason });
      notify(form.enabled ? 'Employer satisfaction calls now go to the employer specialists.' : 'Employer satisfaction calls follow the learner allocation again.');
      setReason('');
      load();
      onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The change could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: number) => setForm({
    ...form, agent_ids: form.agent_ids.includes(id) ? form.agent_ids.filter(item => item !== id) : [...form.agent_ids, id],
  });
  const names = (ids: number[]) => ids.map(id => data?.agents.find(agent => agent.id === id)?.display_name || `#${id}`).join(', ');
  const chosen = data ? data.agents.filter(agent => form.agent_ids.includes(agent.id)) : [];
  const learners = chosen.reduce((total, agent) => total + agent.allocated_learners, 0);
  const changed = !!data && (form.enabled !== data.values.enabled || [...form.agent_ids].sort().join() !== [...data.values.agent_ids].sort().join());

  return (
    <section className="ec-card ec-settings">
      <h2>Employer satisfaction</h2>
      {!data ? <p className="ec-muted">{error || 'Loading…'}</p> : (
        <>
          <p className="ec-muted">
            {data.values.enabled
              ? `Made by ${names(data.values.agent_ids)}. Nobody else sees employer satisfaction calls.`
              : 'Each employer is called by the specialist who looks after most of its learners.'}
            {` ${data.open_employer_cases} open employer ${data.open_employer_cases === 1 ? 'case' : 'cases'}.`}
          </p>
          {data.not_set_up && <p className="ec-alert">{data.not_set_up}</p>}
          <fieldset disabled={busy || !data.set_up}>
            <label className="ec-choice">
              <input type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })} />
              Employer satisfaction calls are made by employer specialists
            </label>
            {form.enabled && (
              <>
                <p className="ec-muted">The specialists you tick see only employer satisfaction, with the usual calling: Next call goes through the employers. Everyone else no longer sees employer satisfaction.</p>
                <div className="ec-checks">
                  {data.agents.map(agent => (
                    <label key={agent.id}>
                      <input type="checkbox" checked={form.agent_ids.includes(agent.id)} onChange={() => toggle(agent.id)} />
                      {agent.display_name}
                    </label>
                  ))}
                  {!data.agents.length && <span className="ec-muted">No active specialists. Add one under Zoom Phone.</span>}
                </div>
                {learners > 0 && (
                  <p className="ec-alert">
                    {chosen.filter(agent => agent.allocated_learners).map(agent => `${agent.display_name} has ${agent.allocated_learners} allocated ${agent.allocated_learners === 1 ? 'learner' : 'learners'}`).join('; ')}.
                    {' '}While they make the employer calls, those learners are in the shared queue for everyone else; they come back when this is switched off.
                  </p>
                )}
              </>
            )}
            {changed && (
              <>
                <label>Reason for the change
                  <textarea rows={2} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}
                    placeholder="For example: Alice covers employer calls this term" />
                </label>
                <div className="ec-buttons">
                  <button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
                  <button type="button" disabled={busy} onClick={() => setForm(data.values)}>Cancel</button>
                </div>
              </>
            )}
          </fieldset>
          {error && <p className="ec-alert" role="alert">{error}</p>}
          {data.history.length > 0 && (
            <details>
              <summary>Changes</summary>
              <ul className="ec-settings-history">
                {data.history.map(entry => (
                  <li key={entry.id}>
                    <strong>{entry.value.enabled ? `On: ${names(entry.value.agent_ids)}` : 'Off'}</strong> · {entry.actor} · {when(entry.created_at)}
                    <div className="ec-muted">{entry.reason}</div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
