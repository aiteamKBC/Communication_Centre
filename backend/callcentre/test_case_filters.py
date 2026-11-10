from unittest.mock import patch

from django.test import SimpleTestCase

from .case_filters import add_filter_contexts
from .learners import Learners


class CaseFilterTests(SimpleTestCase):
    def directory(self):
        return Learners({
            'one@example.org': {'learner_email': 'one@example.org', 'coach': 'Coach A'},
            'two@example.org': {'learner_email': 'two@example.org', 'coach': 'Coach B'},
        }, {'old@example.org': 'one@example.org'}, cohorts={
            'one@example.org': {'cohort': 'Cohort 1', 'group': 'Different group'},
            'two@example.org': {'cohort': 'Cohort 2', 'group': ''},
        })

    @patch('callcentre.case_filters.cached_directory')
    def test_alias_gets_real_cohort_and_ticket_module_without_writes(self, read):
        read.return_value = self.directory()
        cases = [{'source_type': 'attendance', 'learner_email': 'old@example.org',
                  'coach': 'Coach A', 'module': 'Marketing', 'programme': 'Not a module'},
                 {'source_type': 'pr', 'learner_email': 'two@example.org', 'coach': 'Coach B'}]
        add_filter_contexts(cases)
        read.assert_called_once()
        self.assertEqual(cases[0]['filter_contexts'], [
            {'coach': 'Coach A', 'cohort': 'Cohort 1', 'module': 'Marketing'}])
        self.assertEqual(cases[1]['filter_contexts'], [
            {'coach': 'Coach B', 'cohort': 'Cohort 2', 'module': ''}])

    @patch('callcentre.case_filters.cached_directory')
    def test_employer_contexts_keep_each_learners_coach_and_cohort_together(self, read):
        read.return_value = self.directory()
        case = {'source_type': 'employer_feedback', 'learner_email': 'manager@example.org',
                'coach': '', 'employer_learners': [
                    {'email': 'one@example.org'}, {'email': 'two@example.org'}]}
        add_filter_contexts([case])
        self.assertEqual(case['filter_contexts'], [
            {'coach': 'Coach A', 'cohort': 'Cohort 1', 'module': ''},
            {'coach': 'Coach B', 'cohort': 'Cohort 2', 'module': ''},
        ])

    @patch('callcentre.case_filters.cached_directory')
    def test_missing_directory_fields_remain_unknown(self, read):
        read.return_value = Learners({}, {})
        case = {'source_type': 'manual', 'learner_email': 'missing@example.org', 'coach': 'Known coach'}
        add_filter_contexts([case])
        self.assertEqual(case['filter_contexts'], [
            {'coach': 'Known coach', 'cohort': '', 'module': ''}])

    @patch('callcentre.case_filters.cached_directory')
    def test_empty_list_does_not_load_directory(self, read):
        add_filter_contexts([])
        read.assert_not_called()
