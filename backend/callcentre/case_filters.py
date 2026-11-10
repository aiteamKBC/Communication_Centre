"""Read-only filter metadata for the calling lists; no case or learner writes."""
from .sources import cached_directory


def add_filter_contexts(cases):
    if not cases:
        return
    people = cached_directory()
    for case in cases:
        employer = case['source_type'] == 'employer_feedback'
        contacts = case.get('employer_learners', []) if employer else [
            {'email': case['learner_email']}]
        contexts = []
        for contact in contacts:
            email = str(contact.get('email') or '').strip().lower()
            profile = people.get(email, {})
            canonical = profile.get('learner_email', email)
            cohort = people.cohorts.get(canonical, {}).get('cohort', '')
            contexts.append({
                'coach': str((profile.get('coach') if employer else case.get('coach'))
                             or profile.get('coach') or '').strip(),
                'cohort': str(cohort or '').strip(),
                'module': str(case.get('module') or '').strip(),
            })
        # Keep each employer's coach/cohort on the same learner, so combining
        # filters cannot accidentally match two different learners.
        case['filter_contexts'] = contexts or [{
            'coach': str(case.get('coach') or '').strip(), 'cohort': '',
            'module': str(case.get('module') or '').strip(),
        }]
