/** The coaches' screen of the Engagement Centre (backend callcentre/coach_centre.py). */

/** Where the Engagement Centre is with a missed lecture. */
export type LectureState = 'catch_up_booked' | 'promised' | 'callback' | 'calling' | 'waiting';

/** An open missed-lecture case. */
export type Lecture = {
  id: number; date: string | null; module: string; missed_catch_up: boolean; attempts: number;
  state: LectureState; at: string | null;
};

/** A missed lecture closed as caught up with the coach in the last 30 days: marked by the coach, by the director on the
 * coach's desk, or said by the learner on a call (``agent``). */
export type CaughtUp = { id: number; date: string | null; module: string; marked_at: string; marked_by: string };

/** The learner's entry on the do-not-call list. */
export type DoNotCallEntry = {
  id: number; reason: string; reason_label: string; note: string; until: string | null;
  added_role: 'director' | 'coach'; added_by: string; added_at: string;
};

/** One of the learner's lectures in the next two weeks, as the LMS assigns it. */
export type UpcomingLecture = {
  ref: string; module: string; session_number: number | null; starts_at: string; ends_at: string | null; date: string;
};

/** Where an authorised absence is: the lecture is still to come, waiting for the register, its case closed, no absence
 * recorded a week after the lecture (the learner most likely attended), or withdrawn. */
export type AbsenceState = 'coming' | 'waiting' | 'applied' | 'no_absence' | 'cancelled';

export type Absence = {
  id: number; session_ref: string; date: string; starts_at: string; module: string; reason: string; reason_label: string;
  note: string; added_by: string; added_role: 'director' | 'coach'; created_at: string; cancelled_by: string;
  cancelled_at: string | null; ticket_id: number | null; applied_at: string | null; state: AbsenceState;
};

export type CoachLearner = {
  email: string; name: string; programme: string; organisation: string;
  lectures: Lecture[]; caught_up: CaughtUp[]; do_not_call: DoNotCallEntry | null;
  upcoming: UpcomingLecture[]; absences: Absence[];
};

export type CoachOverview = {
  coach: { email: string; name: string };
  complete: boolean;
  do_not_call: { set_up: boolean; not_set_up: string; reasons: Record<string, string> };
  absences: { set_up: boolean; not_set_up: string; reasons: Record<string, string>; days: number; error: string };
  learners: CoachLearner[];
};

/** Whose desk: the signed-in coach's own (no ``coach``), or the coach a director opened. */
export type DeskTarget = { coach?: string };
