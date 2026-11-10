import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ApiError } from '../api';
import { problemMessage } from './formErrors';
import type { Problem } from './formErrors';

/** What failed, why, and how to find it: the action, the message, the server's reference for its log, and (on a
 * developer's machine) the error and the line it came from. Scrolls itself into view so it is never missed. */
export default function ErrorNotice({ problem }: { problem: Problem }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (problem) box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [problem]);
  if (!problem) return null;
  const { error } = problem;
  const api = error instanceof ApiError ? error : null;
  return (
    <div ref={box} className="ed-problem" role="alert">
      <strong>{problem.action} failed.</strong>
      <p>{problemMessage(error)}</p>
      {api?.field && <p className="ec-muted">The field to fix is marked below.</p>}
      {api?.reference && <p className="ec-muted">Reference for the server log: <code>{api.reference}</code></p>}
      {api?.debug && (
        <details>
          <summary>Technical details</summary>
          <p><code>{api.debug.error}</code></p>
          {api.debug.where && <p>At <code>{api.debug.where}</code></p>}
        </details>
      )}
      {api && !api.reference && api.status >= 500 && <p className="ec-muted">HTTP {api.status}</p>}
    </div>
  );
}

/** A labelled form field with a hint (where to find the value) and its own error message. */
export function Field({ label, hint, error, wide, children }: {
  label: string; hint?: ReactNode; error?: string; wide?: boolean; children: ReactNode;
}) {
  return (
    <label className={`ed-field${wide ? ' wide' : ''}${error ? ' has-error' : ''}`}>
      {label}
      {children}
      {error && <small className="ed-field-error">{error}</small>}
      {hint && hint !== error && <small className="ed-field-hint">{hint}</small>}
    </label>
  );
}
