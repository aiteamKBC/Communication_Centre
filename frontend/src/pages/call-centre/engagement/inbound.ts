// Missed calls to the specialists' lines (inbound/): the shapes and the words the screens use for them.

export type InboundItem = {
  id: number; caller_number: string; caller_name: string; caller_email: string; caller_role: string; line: string;
  received_at: string; result: string; agent: string;
  status: 'open' | 'done'; done_how: string; done_by: string; done_at: string | null; note: string; waited_minutes: number;
  case_id: number | null; voicemail_id: number | null;
  voicemail: { duration_seconds: number | null; transcript_status: string; transcript: string } | null;
};
export type InboundListing = {
  items: InboundItem[];
  summary: { open: number; received: number; done: number; median_minutes: number | null; within_hour: number; days: number };
};

export const RESULTS: Record<string, string> = { no_answer: 'Missed', voicemail: 'Left a voicemail', other: 'Hung up while ringing' };
export const DONE: Record<string, string> = { called_back: 'Called back', got_through: 'Rang again and got through', marked: 'Marked done' };
export const ROLES: Record<string, string> = { learner: 'Learner', line_manager: 'Line manager' };

export const waited = (minutes: number) => (minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes / 1440)} days`);
