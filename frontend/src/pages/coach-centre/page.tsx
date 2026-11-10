import { useNavigate, useSearchParams } from 'react-router-dom';
import { readStoredAuthUser } from '../../utils/authStorage';
import Shell from '../call-centre/engagement/Shell';
import { signOut } from '../call-centre/signOut';
import CoachDesk from './CoachDesk';

const GROUPS = [{ title: 'Coach', items: [{ key: 'learners', label: 'My learners', icon: 'people' }] }];
const OWN_DESK = {};

/** The coaches' screen of the Engagement Centre: the coach's own learners, their missed lectures and their calls. */
export default function CoachCentrePage() {
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  return (
    <div className="kbc-portals">
      <Shell title="Coach Engagement Centre" email={String(readStoredAuthUser()?.email || '')} groups={GROUPS} active="learners"
        onNavigate={() => setParams({})} onSignOut={() => signOut(navigate)}>
        <CoachDesk target={OWN_DESK} />
      </Shell>
    </div>
  );
}
