import { useCallback, useEffect, useState } from 'react';
import type { CaseDetail } from '../api';
import { loadCase } from './actions';

/** Loads one case with its calls, events and emails. */
export function useCase(id: number | null) {
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (id === null) {
      setDetail(null);
      return undefined;
    }
    let live = true;
    setError('');
    loadCase(id)
      .then(data => { if (live) setDetail(data); })
      .catch(reason => { if (live) setError(reason instanceof Error ? reason.message : 'The case could not be loaded.'); });
    return () => { live = false; };
  }, [id, revision]);

  return { detail: detail && detail.ticket.id === id ? detail : null, error, refresh };
}
