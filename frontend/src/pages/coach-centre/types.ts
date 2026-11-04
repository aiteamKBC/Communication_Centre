/** The coaches' screen of the Engagement Centre (backend callcentre/coach_centre.py). */

/** Where the Engagement Centre is with a missed lecture. */
export type LectureState = 'catch_up_booked' | 'promised' | 'callback' | 'calling' | 'waiting';

/** An open missed-lecture case. */
export type Lecture = {
  id: number; date: string | null; module: string; missed_catch_up: boolean; attempts: number;
  state: LectureState; at: string | null;
};

/** A missed lecture closed as caught up with the coach in the last 30 days. */
export type CaughtUp = { id: number; date: string | null; module: string; marked_at: string; by_coach: boolean };

/** The learner's entry on the do-not-call list. */
export type DoNotCallEntry = {
  id: number; reason: string; reason_label: string; note: string; until: string | null;
  added_role: 'director' | 'coach'; added_by: string; added_at: string;
};

export type CoachLearner = {
  email: string; name: string; programme: string; organisation: string;
  lectures: Lecture[]; caught_up: CaughtUp[]; do_not_call: DoNotCallEntry | null;
};

export type CoachOverview = {
  coach: { email: string; name: string };
  complete: boolean;
  do_not_call: { set_up: boolean; not_set_up: string; reasons: Record<string, string> };
  learners: CoachLearner[];
};
