import { useEffect, useState } from 'react';
import type { Issue, Overview } from '../api';
import type { Session } from './actions';
import { activeCase, contactKey } from './model';
import LearnerCases from './LearnerCases';
import LearnerPanel from './LearnerPanel';
import { useCase } from './useCase';

/** Visited case forms stay mounted, so switching issues does not discard unsaved work. */
export default function LearnerWorkspace({ id, overview, session, onSaved, notify, onRefresh }: {
  id: number; overview: Overview; session: Session; onSaved: (message: string) => void;
  notify: (message: string, error?: boolean) => void; onRefresh: () => void;
}) {
  const [selected, setSelected] = useState(id);
  const [visited, setVisited] = useState([id]);
  const { detail, error, refresh } = useCase(id);
  useEffect(() => { refresh(); }, [overview.generated_at, refresh]);
  const initial = detail?.ticket || overview.cases.find(c => c.id === id);
  const cases = new Map<number, Issue>();
  if (initial) {
    for (const c of overview.cases) {
      if (activeCase(c) && contactKey(c) === contactKey(initial)) cases.set(c.id, c);
    }
    for (const c of detail?.issues || []) cases.set(c.id, c);
    // Keep the selected starting case available even when it was resolved during this conversation.
    cases.set(initial.id, initial);
  }
  function open(caseId: number) {
    setVisited(current => current.includes(caseId) ? current : [...current, caseId]);
    setSelected(caseId);
  }
  return <div className="ed-contact-workspace">
    <aside>
      <LearnerCases cases={[...cases.values()]} selected={selected} onOpen={open} />
      {error && <p role="alert">Could not load all cases. {error} <button type="button" onClick={refresh}>Retry</button></p>}
      {!detail && !error && <p role="status">Loading all cases…</p>}
      {overview.cases_truncated && !detail && <p>More cases may be available when loading completes.</p>}
    </aside>
    <div className="ed-contact-panel">
      {visited.map(caseId => <LearnerPanel key={caseId} id={caseId} overview={overview} session={session}
        hidden={caseId !== selected} showRelated={false} onOpen={open} onNext={() => {}} hasNext={false}
        onSaved={message => { refresh(); onSaved(message); }} notify={notify}
        onRefresh={() => { refresh(); onRefresh(); }} />)}
    </div>
  </div>;
}
