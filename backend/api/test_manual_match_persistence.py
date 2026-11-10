"""Persisted manual links survive release-era payloads and unrelated edits."""
import json
import tempfile
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import DatabaseError, connection
from django.test import Client, TestCase

from api.models import TrainingPlan
from api.views import training_plan_marker_value, training_plan_version


class ManualMatchPersistenceTests(TestCase):
    _created_table = False

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if TrainingPlan._meta.db_table not in connection.introspection.table_names():
            with connection.schema_editor() as editor:
                editor.create_model(TrainingPlan)
            cls._created_table = True

    @classmethod
    def tearDownClass(cls):
        if cls._created_table:
            with connection.schema_editor() as editor:
                editor.delete_model(TrainingPlan)
        super().tearDownClass()

    def setUp(self):
        TrainingPlan.objects.all().delete()
        self.user = get_user_model().objects.create_user(username='manual-match-editor')
        self.row = TrainingPlan.objects.create(
            cohort_name='Cohort', program='Programme', starting_date_lable='2026-01-01',
            module_name='Module', start_date='2026-01-05', end_date='2026-01-19',
            notes='__program_id:p1\n__cohort_id:c1\n__block_id:b1\n__group_id:g1\nExisting notes',
        )

    def fresh_client(self):
        client = Client()
        client.force_login(self.user)
        return client

    def patch(self, fields, path=None):
        return self.fresh_client().patch(path or f'/api/training-plan/modules/{self.row.id}/',
                              data=json.dumps({'version': training_plan_version(), **fields}),
                              content_type='application/json')

    def assert_saved_match(self, source_id='source-1'):
        # A fresh request/client must reconstruct the link from database storage.
        items = self.fresh_client().get('/api/training-plan/').json()['items']
        notes = next(item['notes'] for item in items if str(item['id']) == str(self.row.id))
        self.assertEqual(training_plan_marker_value(notes, '__lms_source_module_id:'), source_id)

    def test_match_survives_notes_colour_cohort_and_fresh_client(self):
        self.assertEqual(self.patch({'lmsSourceModuleId': 'source-1'}).status_code, 200)
        for fields in (
            {'notes': 'Edited visible notes'},
            {'notes': '__program_id:p1\n__cohort_id:c1\n__block_id:b1\nNotes from older client'},
            {'notes': ''},
            {'color': '#123456', 'moduleName': 'Updated module'},
        ):
            with self.subTest(fields=fields):
                self.assertEqual(self.patch(fields).status_code, 200)
                self.assert_saved_match()
        response = self.patch({
            'programmeId': 'p1', 'cohortName': 'Updated cohort',
            'startingDateLabel': '2026-01-01', 'blocks': [{
                'trainingPlanId': str(self.row.id), 'blockId': 'b1', 'groupId': 'g1',
                'groupName': 'Updated group', 'coachName': '', 'notes': 'Cohort edit notes',
            }],
        }, '/api/training-plan/cohorts/c1/')
        self.assertEqual(response.status_code, 200, response.content)
        self.assert_saved_match()

    def test_explicit_removal_still_works_and_stale_requests_cannot_clear_match(self):
        stale_version = training_plan_version()
        self.assertEqual(self.patch({'lmsSourceModuleId': 'source-1'}).status_code, 200)
        self.assertEqual(self.patch({'version': stale_version, 'lmsSourceModuleId': ''}).status_code, 409)
        self.assert_saved_match()
        self.assertEqual(self.patch({'lmsSourceModuleId': '', 'notes': 'Keep notes'}).status_code, 200)
        self.assert_saved_match('')
        self.row.refresh_from_db()
        self.assertTrue(self.row.notes.endswith('Keep notes'))

    def test_existing_marker_only_matches_remain_compatible(self):
        response = self.patch({'notes': '__program_id:p1\n__lms_source_module_id:source-1\nLegacy match'})
        self.assertEqual(response.status_code, 200)
        self.assert_saved_match()

    def test_date_move_and_undo_preserve_manual_match_and_intervening_notes_edit(self):
        self.assertEqual(self.patch({'lmsSourceModuleId': 'source-1'}).status_code, 200)
        path = f'/api/training-plan/sessions/{self.row.id}/'
        self.assertEqual(self.patch({'startDate': '2026-01-12', 'endDate': '2026-01-26'}, path).status_code, 200)
        self.assert_saved_match()
        self.assertEqual(self.patch({'notes': 'Notes edited after the move'}).status_code, 200)
        self.assertEqual(self.patch({'startDate': '2026-01-05', 'endDate': '2026-01-19'}, path).status_code, 200)
        self.row.refresh_from_db()
        self.assertEqual((self.row.start_date, self.row.end_date), ('2026-01-05', '2026-01-19'))
        self.assertTrue(self.row.notes.endswith('Notes edited after the move'))
        self.assert_saved_match()
        self.assertEqual(TrainingPlan.objects.count(), 1)

    def test_invalid_match_id_cannot_change_saved_data(self):
        for value in (None, 42, 'source\n__block_id:injected', 'source\rhidden'):
            with self.subTest(value=value):
                self.assertEqual(self.patch({'lmsSourceModuleId': value}).status_code, 400)
        self.assert_saved_match('')

    def test_release_baseline_detects_lost_and_changed_links_with_same_count(self):
        self.assertEqual(self.patch({'lmsSourceModuleId': 'source-1'}).status_code, 200)
        with tempfile.TemporaryDirectory() as directory:
            baseline = Path(directory) / 'matches.json'
            call_command('check_training_plan_manual_matches', snapshot=baseline, stdout=StringIO())
            call_command('check_training_plan_manual_matches', compare=baseline, stdout=StringIO())
            with self.assertRaisesMessage(CommandError, 'already exists'):
                call_command('check_training_plan_manual_matches', snapshot=baseline, stdout=StringIO())
            # A deployment can leave the count unchanged while losing a link.
            self.assertEqual(self.patch({'lmsSourceModuleId': 'different-source'}).status_code, 200)
            with self.assertRaisesMessage(CommandError, '0 missing, 1 changed'):
                call_command('check_training_plan_manual_matches', compare=baseline, stdout=StringIO())
            self.assertEqual(self.patch({'lmsSourceModuleId': ''}).status_code, 200)
            with self.assertRaisesMessage(CommandError, '1 missing, 0 changed'):
                call_command('check_training_plan_manual_matches', compare=baseline, stdout=StringIO())

    def test_archiving_preserves_baseline_and_malformed_baseline_is_rejected(self):
        self.assertEqual(self.patch({'lmsSourceModuleId': 'source-1'}).status_code, 200)
        with tempfile.TemporaryDirectory() as directory:
            baseline = Path(directory) / 'matches.json'
            call_command('check_training_plan_manual_matches', snapshot=baseline, stdout=StringIO())
            TrainingPlan.objects.filter(pk=self.row.id).update(is_archived=True)
            call_command('check_training_plan_manual_matches', compare=baseline, stdout=StringIO())
            baseline.write_text('{}', encoding='utf-8')
            with self.assertRaisesMessage(CommandError, 'Invalid or unreadable'):
                call_command('check_training_plan_manual_matches', compare=baseline, stdout=StringIO())

    def test_database_failure_does_not_write_baseline_or_expose_connection_details(self):
        with tempfile.TemporaryDirectory() as directory:
            baseline = Path(directory) / 'matches.json'
            with patch('api.management.commands.check_training_plan_manual_matches.TrainingPlan.objects.using',
                       side_effect=DatabaseError('private connection details')):
                with self.assertRaises(CommandError) as error:
                    call_command('check_training_plan_manual_matches', snapshot=baseline, stdout=StringIO())
            self.assertNotIn('private', str(error.exception))
            self.assertFalse(baseline.exists())
