"""Missed-lecture attendance panel and corrections made on the call (attendance_edits.py).

Run with ``python check_isolated_tests.py callcentre.test_attendance_edits`` (in-memory SQLite only): the LMS registers
are answered by fakes, and the writes are checked by the SQL they send.
"""
import unittest
from contextlib import contextmanager, nullcontext
from datetime import date, timedelta
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import connections, transaction
from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from . import attendance_edits as ae
from .models import Agent, AttendanceEdit, CallIntent, CaseTicket, TicketEvent
from .services import Conflict

IDS = {'emails': ['jacinta@x.test'], 'profiles': [42], 'aptem': ['9001']}


def live(row_id, day, number, status='present', module='Martech - Tue', occurrence=None):
    return {'id': row_id, 'occurrence_id': occurrence or f'o-{row_id}', 'learner_profile_id': 42, 'attendance_status': status,
            'day': day, 'session_number': number, 'module': module}


def kbc(key, day, attendance=1, status=None, module='Marketing'):
    return {'key': key, 'day': day, 'module': module, 'lecture_name': 'Lecture', 'Attendance': attendance,
            'attendance_status': status}


def case(key='106', day=date(2026, 10, 6), module='Martech - Tue', **fields):
    return SimpleNamespace(pk=1, learner_email='jacinta@x.test', overdue_since=day,
                           source_data={'attendance_key': key, 'module': module}, **fields)


# Jacinta's Tuesday lectures, the missed 6 Oct one, and the same session she attended on Friday 9 Oct with another group.
JACINTA = [live(101, date(2026, 9, 22), 1), live(102, date(2026, 9, 29), 2), live(106, date(2026, 10, 6), 3, 'absent'),
           live(109, date(2026, 10, 9), 3, module='Martech - Fri'), live(113, date(2026, 10, 13), 4),
           live(120, date(2026, 10, 20), 5), live(127, date(2026, 10, 27), 6)]


def history(ticket, live_rows, kbc_rows=(), adjustments=()):
    with mock.patch.object(ae, 'learner_ids', return_value=IDS), \
            mock.patch.object(ae, 'read_registers', return_value=(list(live_rows), list(kbc_rows), list(adjustments))):
        return ae.history(ticket)


class HistoryTests(SimpleTestCase):

    def test_shows_two_lectures_either_side_of_the_missed_one_and_the_covering_lecture(self):
        data = history(case(), JACINTA)
        self.assertEqual(data['missed'], 'live:106')
        self.assertEqual(data['covering'], 'live:109')
        self.assertEqual(data['window'], ['live:101', 'live:102', 'live:106', 'live:109', 'live:113'])
        self.assertEqual(data['usual_weekday'], 'Tue')
        self.assertEqual(data['summary'], {'present': 6, 'absent': 1, 'unmarked': 0, 'rate': 86})

    def test_a_covering_lecture_outside_the_window_is_still_shown(self):
        rows = [live(101, date(2026, 9, 1), 1, 'absent'), *[live(110 + n, date(2026, 9, 8) + timedelta(weeks=n), n + 2) for n in range(5)],
                live(199, date(2026, 10, 30), 1, module='Martech - Fri')]
        data = history(case(key='101', day=date(2026, 9, 1)), rows)
        self.assertEqual(data['covering'], 'live:199')
        self.assertEqual(data['window'], ['live:101', 'live:110', 'live:111', 'live:199'])

    def test_no_covering_lecture_when_two_could_be(self):
        rows = [*JACINTA, live(140, date(2026, 10, 10), 3, module='Martech copy')]
        self.assertIsNone(history(case(), rows)['covering'])

    def test_the_live_register_wins_on_a_date_both_cover_and_kbc_statuses_read_as_in_the_lms(self):
        rows = [kbc('k1', date(2026, 10, 6), 1), kbc('k2', date(2026, 9, 1), 1), kbc('k3', date(2026, 9, 2), 1, 'absent'),
                kbc('k4', date(2026, 9, 3), None)]
        data = history(case(), [live(106, date(2026, 10, 6), 3, 'absent')], rows)
        statuses = {record['ref']: record['status'] for record in data['records']}
        self.assertEqual(statuses, {'kbc:k2': 'present', 'kbc:k3': 'absent', 'kbc:k4': None, 'live:106': 'absent'})

    def test_the_lms_corrections_apply_and_deleted_lectures_are_left_out(self):
        adjustments = [{'learner_id': 42, 'source': ae.TEAMS, 'source_id': 'o-106', 'status': 'present', 'is_deleted': False},
                       {'learner_id': 42, 'source': ae.TEAMS, 'source_id': 'o-109', 'status': '', 'is_deleted': True}]
        data = history(case(), JACINTA, adjustments=adjustments)
        shown = {record['ref']: record for record in data['records']}
        self.assertNotIn('live:109', shown)
        self.assertEqual((shown['live:106']['status'], shown['live:106']['corrected']), ('present', True))
        self.assertEqual(data['summary']['rate'], 100)


class Cursor:
    """Records the SQL a write sends and answers its SELECTs in order."""
    def __init__(self, answers):
        self.answers, self.sent = list(answers), []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=()):
        self.sent.append((' '.join(sql.split()), list(params)))

    def fetchone(self):
        return self.answers.pop(0)


@contextmanager
def lms(answers):
    cursor = Cursor(answers)
    with mock.patch.object(ae, '_lms_cursor', return_value=cursor), mock.patch.object(ae.transaction, 'atomic'):
        yield cursor


LIVE_106 = {'ref': 'live:106', 'source': 'live', 'profile_id': 42, 'source_id': 'o-106', 'status': 'absent'}
LIVE_109 = {'ref': 'live:109', 'source': 'live', 'profile_id': 42, 'source_id': 'o-109', 'status': 'present'}
KBC_K1 = {'ref': 'kbc:k1', 'source': 'kbc', 'profile_id': 42, 'source_id': 'k1', 'status': 'absent'}


class WriteTests(SimpleTestCase):
    """The same writes the LMS makes, so both systems show the same attendance."""

    def test_marking_a_live_lecture_attended_sets_the_register_and_the_lms_correction(self):
        with lms([('absent',), None]) as cursor:
            values = ae.write(LIVE_106, 'present', 'alice@kbc.test')
        update = next(params for sql, params in cursor.sent if sql.startswith('UPDATE curriculum.live_session_learner_attendance'))
        upsert = next(params for sql, params in cursor.sent if sql.startswith('INSERT INTO "Coach".coach_attendance_adjustment'))
        self.assertEqual(update, ['present', 106])
        self.assertEqual(upsert, ['alice@kbc.test', 42, ae.TEAMS, 'o-106', 'present', False, 'alice@kbc.test', 'present'])
        self.assertEqual(values, {'before': {'attendance_status': 'absent', 'adjustment': None},
                                  'after': {'attendance_status': 'present', 'adjustment': {'status': 'present', 'is_deleted': False}}})

    def test_deleting_a_lecture_is_the_lms_deleted_correction_and_leaves_the_register_row(self):
        with lms([None]) as cursor:
            ae.write(LIVE_109, 'delete', 'alice@kbc.test')
        self.assertFalse(any(sql.startswith('UPDATE curriculum') or sql.startswith('DELETE') for sql, _ in cursor.sent))
        upsert = next(params for sql, params in cursor.sent if sql.startswith('INSERT INTO "Coach".coach_attendance_adjustment'))
        self.assertEqual(upsert, ['alice@kbc.test', 42, ae.TEAMS, 'o-109', None, True, 'alice@kbc.test', None])

    def test_a_kbc_lecture_is_corrected_in_kbc_attendance_as_the_lms_saves_it(self):
        with lms([(0, 'absent'), (None,)]) as cursor:
            values = ae.write(KBC_K1, 'present', 'alice@kbc.test')
        update = next(params for sql, params in cursor.sent if sql.startswith('UPDATE public.kbc_attendance'))
        self.assertEqual(update, [1, 1, 'k1'])
        self.assertEqual(values['after'], {'Attendance': 1, 'attendance_status': None})

    def test_a_lecture_without_one_lms_profile_cannot_be_deleted(self):
        with self.assertRaisesMessage(Conflict, 'no single LMS profile'):
            ae.write({**KBC_K1, 'profile_id': None}, 'delete', 'alice@kbc.test')

    def test_undo_restores_the_register_only_while_it_still_holds_the_correction(self):
        edit = SimpleNamespace(record_ref='live:106', action='present',
                               before={'attendance_status': 'absent', 'adjustment': None},
                               after={'attendance_status': 'present', 'adjustment': {'status': 'present', 'is_deleted': False}})
        current = {'status': 'present', 'is_deleted': False, 'owner_email': 'a', 'updated_by': 'a'}
        with lms([('o-106', 'present'), tuple(current.values())]) as cursor:
            ae.unwrite(edit, 42)
        self.assertIn(['absent', 106], [params for sql, params in cursor.sent if sql.startswith('UPDATE curriculum')])
        self.assertIn([42, ae.TEAMS, 'o-106'], [params for sql, params in cursor.sent if sql.startswith('DELETE FROM "Coach"')])
        with lms([('o-106', 'absent')]), self.assertRaisesMessage(Conflict, 'changed again'):
            ae.unwrite(edit, 42)


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class EditTests(TestCase):
    databases = {'default', 'login_db'}

    def setUp(self):
        users = get_user_model().objects
        self.user = users.create_user('alice', email='alice@kbc.test')
        self.agent = Agent.objects.create(user=self.user, display_name='Alice', zoom_email='alice@kbc.test', zoom_account='student')
        self.ticket = CaseTicket.objects.create(
            source_type='attendance', reason_key='attendance:jacinta', learner_email='jacinta@x.test', learner_name='Jacinta',
            overdue_since=date(2026, 10, 6), due_at=timezone.now(), source_data={'attendance_key': '106', 'module': 'Martech - Tue'})
        kbc_rows = [kbc('k1', date(2026, 9, 1), 0)]
        # The in-memory test databases have no LMS alias: record which databases a correction opens instead.
        self.opened = []
        patches = [mock.patch.object(ae, 'learner_ids', return_value=IDS),
                   mock.patch.object(ae, 'read_registers', return_value=(JACINTA, kbc_rows, [])),
                   mock.patch.object(ae, 'together', side_effect=lambda aliases: self.opened.append(set(aliases)) or nullcontext())]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def edit(self, ref='live:106', action='present', reason='covering_lecture', note='', written=None):
        values = written or {'before': {'attendance_status': 'absent'}, 'after': {'attendance_status': action}}
        with mock.patch.object(ae, 'write', return_value=values) as write:
            edit = ae.apply_edit(self.ticket, self.user, self.agent, ref, action, reason, note)
        return edit, write

    def test_a_correction_on_the_call_is_written_kept_and_waits_for_the_ai_check(self):
        intent = CallIntent.objects.create(agent=self.agent, learner_email='jacinta@x.test', number='+447700900001')
        intent.tickets.add(self.ticket)
        edit, write = self.edit()
        self.assertEqual(write.call_args.args[1:], ('present', 'alice@kbc.test'))
        self.assertEqual((edit.state, edit.ai_state, edit.intent_id, edit.before), ('applied', 'pending', intent.pk, {'attendance_status': 'absent'}))
        self.assertEqual((edit.session_date, edit.module, edit.lecture), (date(2026, 10, 6), 'Martech - Tue', 'Session 3'))
        self.assertTrue(TicketEvent.objects.filter(ticket=self.ticket, kind='attendance_edit', data__edit_id=edit.pk).exists())

    def test_a_correction_outside_a_call_has_nothing_for_the_ai_to_check(self):
        edit, _ = self.edit(ref='live:109', action='delete')
        self.assertEqual(edit.ai_state, 'no_call')

    def test_only_this_learners_lectures_with_a_reason_on_an_open_case(self):
        with self.assertRaisesMessage(Conflict, 'not in the learner’s register'):
            self.edit(ref='live:999')
        with self.assertRaisesMessage(ValueError, 'already marked attended'):
            self.edit(ref='live:101')
        with self.assertRaisesMessage(ValueError, 'Say what the learner told you'):
            self.edit(reason='other')
        CaseTicket.objects.filter(pk=self.ticket.pk).update(status='resolved')
        self.ticket.refresh_from_db()
        with self.assertRaisesMessage(Conflict, 'This case is closed'):
            self.edit()
        self.assertFalse(AttendanceEdit.objects.exists())

    def test_the_panel_and_a_correction_through_the_api(self):
        # Who may use the Engagement Centre is tested in tests.py.
        self.enterContext(mock.patch('callcentre.views.refused', return_value=None))
        self.client.force_login(self.user)
        url = f'/api/callcentre/tickets/{self.ticket.pk}/attendance/'
        panel = self.client.get(url).json()
        self.assertEqual((panel['missed'], panel['covering'], panel['set_up']), ('live:106', 'live:109', True))
        self.assertNotIn('_records', panel)
        with mock.patch.object(ae, 'write', return_value={'before': {}, 'after': {}}):
            response = self.client.post(url, {'changes': [{'ref': 'live:106', 'action': 'present'}], 'reason': 'covering_lecture',
                                              'agent_id': self.agent.pk}, content_type='application/json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['edits'][0]['action_label'], 'Marked attended')
        other = CaseTicket.objects.create(source_type='epa', reason_key='epa:jacinta', learner_email='jacinta@x.test',
                                          learner_name='Jacinta', due_at=timezone.now())
        self.assertEqual(self.client.get(f'/api/callcentre/tickets/{other.pk}/attendance/').status_code, 400)

    def test_a_covering_lecture_is_corrected_all_or_nothing(self):
        written = {'before': {}, 'after': {}}
        with mock.patch.object(ae, 'write', side_effect=[written, RuntimeError('connection lost')]),                 self.assertRaisesMessage(Conflict, 'nothing was saved'):
            ae.apply_edits(self.ticket, self.user, self.agent, [('live:106', 'present'), ('live:109', 'delete')], 'covering_lecture')
        # Both changes were written in one LMS transaction, so the failed second one rolled back the first.
        self.assertEqual(self.opened, [{ae.LMS}])
        self.assertEqual(sorted(AttendanceEdit.objects.values_list('record_ref', 'state')),
                         [('live:106', 'failed'), ('live:109', 'failed')])
        with mock.patch.object(ae, 'write', return_value=written):
            edits = ae.apply_edits(self.ticket, self.user, self.agent, [('live:106', 'present'), ('live:109', 'delete')],
                                   'covering_lecture')
        self.assertEqual([edit.state for edit in edits], ['applied', 'applied'])

    def test_a_kbc_and_a_live_lecture_hold_both_databases_until_both_are_written(self):
        with mock.patch.object(ae, 'write', return_value={'before': {}, 'after': {}}):
            ae.apply_edits(self.ticket, self.user, self.agent, [('kbc:k1', 'present'), ('live:106', 'present')], 'register_error')
        self.assertEqual(self.opened, [{ae.DB, ae.LMS}])
        with self.assertRaisesMessage(ValueError, 'only be changed once'):
            ae.apply_edits(self.ticket, self.user, self.agent, [('live:106', 'present'), ('live:106', 'absent')], 'register_error')

    def test_a_failed_lms_write_is_kept_as_failed_and_nothing_is_claimed(self):
        with mock.patch.object(ae, 'write', side_effect=RuntimeError('connection lost')), \
                self.assertRaisesMessage(Conflict, 'nothing was saved'):
            ae.apply_edit(self.ticket, self.user, self.agent, 'live:106', 'present', 'covering_lecture')
        edit = AttendanceEdit.objects.get()
        self.assertEqual((edit.state, edit.error), ('failed', 'RuntimeError'))

    def test_a_director_undoes_a_correction_with_a_reason(self):
        edit, _ = self.edit()
        director = get_user_model().objects.create_user('director', is_superuser=True)
        with self.assertRaisesMessage(ValueError, 'Say why'):
            ae.undo(edit.pk, director, '')
        with mock.patch.object(ae, 'rows', return_value=[{'learner_profile_id': 42}]), \
                mock.patch.object(ae, 'unwrite') as unwrite:
            ae.undo(edit.pk, director, 'Learner rang back: she did miss it')
        self.assertEqual(unwrite.call_args.args[1], 42)
        edit.refresh_from_db()
        self.assertEqual((edit.state, edit.undone_by), ('undone', 'director'))
        with self.assertRaisesMessage(Conflict, 'Only a correction that was applied'):
            ae.undo(edit.pk, director, 'Again please')

    def test_the_ai_checks_the_corrections_of_one_call_against_its_transcript(self):
        intent = CallIntent.objects.create(agent=self.agent, learner_email='jacinta@x.test', number='+447700900001')
        intent.tickets.add(self.ticket)
        marked, _ = self.edit()
        deleted, _ = self.edit(ref='live:109', action='delete')
        answer = {marked.pk: ('confirmed', 'I went on the Friday instead'), deleted.pk: ('confirmed', 'the Friday one')}
        with mock.patch('callcentre.ai.ai_enabled', return_value=True), \
                mock.patch.object(ae, 'call_transcript', return_value='...transcript...'), \
                mock.patch.object(ae, 'ask_ai', return_value=answer) as ask:
            self.assertEqual(ae.verify_pending(), 2)
        self.assertEqual([edit.pk for edit in ask.call_args.args[1]], [marked.pk, deleted.pk])
        marked.refresh_from_db()
        self.assertEqual((marked.ai_state, marked.ai_evidence), ('confirmed', 'I went on the Friday instead'))

    def test_without_a_transcript_after_two_days_the_check_gives_up(self):
        intent = CallIntent.objects.create(agent=self.agent, learner_email='jacinta@x.test', number='+447700900001')
        intent.tickets.add(self.ticket)
        edit, _ = self.edit()
        with mock.patch('callcentre.ai.ai_enabled', return_value=True), mock.patch.object(ae, 'call_transcript', return_value=''):
            ae.verify_pending()
            self.assertEqual(AttendanceEdit.objects.get(pk=edit.pk).ai_state, 'pending')
            AttendanceEdit.objects.filter(pk=edit.pk).update(created_at=timezone.now() - timedelta(days=3))
            ae.verify_pending()
        self.assertEqual(AttendanceEdit.objects.get(pk=edit.pk).ai_state, 'no_recording')


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class TogetherTests(TestCase):
    """The transaction the corrections share: an error after writes in two databases undoes both."""
    databases = {'default', 'login_db'}

    def test_an_error_undoes_the_writes_in_every_database(self):
        from django.contrib.auth.models import Group
        with self.assertRaises(RuntimeError), ae.together({'default', 'login_db'}):
            Group.objects.using('default').create(name='written in one database')
            with transaction.atomic(using='login_db'):   # as write() nests its own transaction
                Group.objects.using('login_db').create(name='written in the other')
            raise RuntimeError('the second correction failed')
        self.assertFalse(Group.objects.using('default').exists())
        self.assertFalse(Group.objects.using('login_db').exists())
