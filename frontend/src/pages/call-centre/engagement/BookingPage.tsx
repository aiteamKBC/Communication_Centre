import type { BookingLinks } from '../api';
import { reviewBookingPage } from './model';

/** "Book on coach's page": opens the coach's Microsoft Bookings page for this review, so the specialist books it with
 * the learner on the call, under the learner's own name and email. The LMS is not told; the coach links the review. */
export default function BookingPage({ c, className }: { c: { source_type: string; booking_links: BookingLinks }; className?: string }) {
  const page = reviewBookingPage(c);
  if (!page) return null;
  return (
    <button type="button" className={className} title={`Opens the coach’s ${page.noun} booking page in a new tab. Book it under the learner’s own name and email.`}
      onClick={() => window.open(page.url, '_blank', 'noopener,noreferrer')}>
      Book on coach’s page
    </button>
  );
}
