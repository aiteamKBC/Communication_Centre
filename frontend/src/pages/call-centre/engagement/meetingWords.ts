// Words for the coaches' Outlook review meetings (progress reviews and monthly coaching), shown on reminders and the audit.
import type { ReviewMeetingSummary } from '../api';

export const REPLIES: Record<string, string> = {
  accepted: 'Accepted in Outlook', tentativelyAccepted: 'Tentative in Outlook', declined: 'Declined in Outlook',
  none: 'No reply in Outlook', notResponded: 'No reply in Outlook',
};
export const CANCELLED_HOW: Record<string, string> = {
  outlook: 'Cancelled in Outlook', removed: 'Removed from Outlook', engagement_centre: 'Cancelled from the Engagement Centre',
};
export const CANCEL_REASONS: [string, string][] = [
  ['cannot_attend', 'The learner cannot attend'], ['learner_asked', 'The learner asked to cancel'],
  ['rebooked', 'Rebooked for another time'], ['other', 'Other'],
];
export const EVENT_LABELS: Record<string, string> = {
  found: 'Found in Outlook', moved: 'Moved', learner_matched: 'Learner matched', learner_replied: 'Learner replied',
  confirmed_on_call: 'Confirmed on the call', cancelled_in_outlook: 'Cancelled in Outlook', removed_from_outlook: 'Removed from Outlook',
  back_in_outlook: 'Back in Outlook', cancelled_by_specialist: 'Cancelled from the Engagement Centre', cancel_failed: 'Cancel failed',
  rescheduled_by_specialist: 'Rescheduled from the Engagement Centre', reschedule_failed: 'Reschedule failed',
  lms_moved: 'LMS calendar entry moved', lms_change_failed: 'LMS calendar entry not changed', employer_checked: 'Employer step',
  lms_cancelled: 'LMS calendar entry cancelled', lms_cancel_failed: 'LMS calendar entry not cancelled', coach_note: 'Coach note',
};
export const MATCHED_BY: Record<string, string> = { email: 'invited by email', name: 'named in the title', surname: 'surname, coach’s learner' };

/** What a reminder shows about its meeting, and the tag's tone. */
export function meetingState(meeting: ReviewMeetingSummary): [string, '' | 'green' | 'amber' | 'red'] {
  if (meeting.status === 'cancelled') return [CANCELLED_HOW[meeting.cancelled_how] || 'Cancelled', 'red'];
  if (meeting.confirmed) return ['Confirmed on a call', 'green'];
  const reply = REPLIES[meeting.learner_response] || 'No reply in Outlook';
  return [reply, meeting.learner_response === 'declined' ? 'red' : meeting.learner_response === 'accepted' ? 'green' : 'amber'];
}
