import { useState } from 'react';
import type { Overview } from '../api';
import { csvText, downloadBlob, issueLabel } from './model';

/** Import & export. Exports are built from the current register; CSV import is not connected yet. */
export default function Imports({ overview, onAllocate }: { overview: Overview; onAllocate: () => void }) {
  const [message, setMessage] = useState('');

  function exportCsv(kind: 'learners' | 'cases') {
    const csv = kind === 'cases'
      ? csvText(['case_id', 'learner_email', 'learner_name', 'issue', 'status', 'coach', 'programme', 'organisation', 'due_at', 'next_followup_at', 'attempts', 'in_progress_with'],
        overview.cases.map(c => ({ case_id: c.id, learner_email: c.learner_email, learner_name: c.learner_name, issue: issueLabel(c), status: c.status, coach: c.coach, programme: c.programme, organisation: c.organisation, due_at: c.due_at, next_followup_at: c.next_followup_at, attempts: c.attempts, in_progress_with: c.claimed_by })))
      : csvText(['learner_email', 'learner_name', 'learner_phone', 'programme', 'organisation', 'coach', 'line_manager', 'line_manager_email', 'active_cases'],
        [...new Map(overview.cases.map(c => [c.learner_email.toLowerCase(), c])).values()].map(c => ({
          learner_email: c.learner_email, learner_name: c.learner_name, learner_phone: c.learner_phone, programme: c.programme, organisation: c.organisation,
          coach: c.coach, line_manager: c.manager_name, line_manager_email: c.manager_email,
          active_cases: overview.cases.filter(x => x.learner_email.toLowerCase() === c.learner_email.toLowerCase()).length,
        })));
    downloadBlob(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }), `KBC-${kind}-${overview.today}.csv`);
    setMessage('Export downloaded.');
  }

  return (
    <>
      <section className="ec-card">
        <div className="ec-head">
          <div><h2>Upload now, connect feeds later</h2><p>Bring bookings, attendance reports, assignments, event confirmations and follow-up requests into the calling register.</p></div>
          <button type="button" onClick={onAllocate}>Allocate by coach</button>
        </div>
        <ol>
          <li>Download the learner and case lists to copy the correct IDs and emails.</li>
          <li>Fill in a template and save it as <strong>CSV UTF-8</strong> in Excel.</li>
          <li>Preview every row, then confirm. New work appears as <strong>evidence review</strong> with the learner’s existing specialist.</li>
        </ol>
        <p className="ec-muted">CSV import is not connected yet. Cases are generated automatically from Aptem, attendance and the Zoom Phone feeds.</p>
      </section>
      <div className="ec-status" role="status" aria-live="polite">{message}</div>
      <div className="ec-split">
        <section className="ec-card">
          <h2>1. Download</h2>
          <div className="ec-buttons">
            <button type="button" onClick={() => exportCsv('learners')}>Learners & contacts</button>
            <button type="button" onClick={() => exportCsv('cases')}>Case register</button>
            <button type="button" disabled>Uploaded records</button>
          </div>
          <hr />
          <label>Template for<select disabled><option>Follow up</option></select></label>
          <div className="ec-buttons"><button type="button" disabled>Download CSV template</button></div>
        </section>
        <section className="ec-card">
          <h2>2. Upload and preview</h2>
          <label>Choose CSV file<input type="file" accept=".csv,text/csv" disabled /></label>
          <p className="ec-muted">Up to 1,000 records · 2 MB · .csv format</p>
          <button type="button" className="primary" disabled>Preview import</button>
          <p className="ec-muted">Import is not connected yet. Nothing is saved from this screen.</p>
        </section>
      </div>
      <section className="ec-card">
        <div className="ec-head"><h2>Recent imports</h2><button type="button" disabled>Refresh history</button></div>
        <p>No manual imports yet.</p>
      </section>
    </>
  );
}
