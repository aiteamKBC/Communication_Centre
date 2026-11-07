import { UserRound } from 'lucide-react';
import { isComparisonDate } from '../lmsComparison';

export default function MergedTutorDates({ tutor, startDate, endDate, startDateSource }: {
  tutor: string;
  startDate?: string | null;
  endDate?: string | null;
  startDateSource?: 'created_at';
}) {
  return <span className="tp-merged-tutor-dates">
    <span className="tp-merged-tutor" title={tutor || 'Not assigned'}>
      <UserRound size={12} aria-hidden="true" /><span>{tutor || 'Not assigned'}</span>
    </span>
    <span className="tp-merged-date-range">
      {([['Start', startDate], ['End', endDate]] as const).map(([label, date]) => <span key={label}>
        {isComparisonDate(date ?? null)
          ? <time data-module-date={label.toLowerCase()} dateTime={date!} aria-label={`${label} date: ${date}`}
              title={`${date}${label === 'Start' && startDateSource === 'created_at' ? ' · From created_at (start date missing)' : ''}`}>
              {new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
            </time>
          : <span data-module-date={label.toLowerCase()} title="Date not provided">—</span>}
      </span>)}
    </span>
  </span>;
}
