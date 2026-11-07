import type { RecallState } from './actions';

/** A recall's tries: one dot per try, filled once used, and "1/3 tries". */
export default function RecallTries({ recall }: { recall: RecallState }) {
  return (
    <span className="ed-recall-tries" title={`${recall.used} of ${recall.max} recall tries used`}>
      <span aria-hidden="true">{Array.from({ length: recall.max }, (_, index) => <i key={index} className={index < recall.used ? 'used' : undefined} />)}</span>
      {recall.used}/{recall.max} tries
    </span>
  );
}
