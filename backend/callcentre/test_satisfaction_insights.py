"""The director's satisfaction dashboard: the reviews it counts, its figures, the coverage, and the AI's reading of every
review and of all of them together. OpenAI is faked; nothing leaves the test.

Run with ``python check_isolated_tests.py callcentre.test_satisfaction_insights`` (in-memory SQLite only).
"""
import json
import unittest
import uuid
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from . import satisfaction_insights as insights
from .models import Agent, CaseTicket, CycleState, SatisfactionAI, SatisfactionInsight, TicketEvent

AI_ON = dict(CALLCENTRE_AI_ENABLED=True, OPENAI_API_KEY='test-key', OPENAI_MODEL='test-model')


def reading(review_id, sentiment='positive', praise=('coach_support',), concerns=(), follow_up=False):
    return {'id': review_id, 'sentiment': sentiment, 'follow_up': follow_up, 'summary': 'Learner is happy.',
            'praise': [{'theme': theme, 'point': 'Good coach'} for theme in praise],
            'concerns': [{'theme': theme, 'point': 'LMS is hard', 'severity': severity} for theme, severity in concerns]}


def overall(ids, **changes):
    return {'headline': 'Learners are satisfied.', 'verdict': 'Most learners are happy with their coach.', 'confidence': 0.8,
            'common_issues': [{'title': 'LMS', 'detail': 'Hard to use.', 'review_ids': ids}],
            'strengths': [{'title': 'Coaches', 'detail': 'Supportive.', 'review_ids': ids}],
            'weaknesses': [], 'recommendations': [{'title': 'LMS guide', 'detail': 'Write one.', 'priority': 'high', 'review_ids': ids}],
            'watch_list': [{'review_id': ids[0], 'reason': 'Struggling with the LMS.'}], **changes}


class WordingTests(SimpleTestCase):
    def test_what_specialists_type_for_no_issue_and_no_action(self):
        for value in ('None', 'None.', 'none ', 'N/A', 'na', 'No issue', 'No issues', 'Nothing', '', 'None at the moment'):
            self.assertFalse(insights.raised_issue(value), value)
        for value in ('LMS is hard to understand', 'the above', 'Too much AI', 'No QR code works'):
            self.assertTrue(insights.raised_issue(value), value)
        for value in ('No action needed', 'No action needed.', 'No actio needed', 'No actionn needed', 'no action is needed',
                      'No actions needed', 'NA', ''):
            self.assertFalse(insights.needs_action(value), value)
        for value in ('Needs call with coach', 'Step by step guide', 'Discussion with coach.'):
            self.assertTrue(insights.needs_action(value), value)

    def test_figures_from_scores(self):
        reviews = [{'score': score, 'learner_email': f'{index % 4}@x', 'issue_raised': score <= 3, 'action_agreed': False}
                   for index, score in enumerate([5, 4, 4, 4, 3, 2])]
        figures = insights.score_figures(reviews)
        self.assertEqual(figures['reviews'], 6)
        self.assertEqual(figures['learners'], 4)
        self.assertEqual(figures['average'], 3.67)
        self.assertEqual(figures['median'], 4)
        self.assertEqual(figures['distribution'], {'1': 0, '2': 1, '3': 1, '4': 3, '5': 1})
        self.assertEqual((figures['satisfied'], figures['neutral'], figures['dissatisfied']), (4, 1, 1))
        self.assertEqual(figures['satisfied_pct'], 66.7)
        self.assertEqual(figures['issues_pct'], 33.3)
        self.assertEqual(figures['margin'], 0.83)   # 1.96 * stdev 1.033 / sqrt 6
        empty = insights.score_figures([])
        self.assertIsNone(empty['average'])
        self.assertIsNone(insights.score_figures(reviews[:1])['margin'])

    def test_a_review_reading_is_checked(self):
        good = reading(1, concerns=[('lms_platform', 'medium')])
        self.assertEqual(insights.validate_review(good)['sentiment'], 'positive')
        for bad in ({**good, 'sentiment': 'happy'}, {**good, 'extra': 1}, {**good, 'follow_up': 'no'},
                    {**good, 'praise': [{'theme': 'made_up', 'point': 'x'}]},
                    {**good, 'concerns': [{'theme': 'lms_platform', 'point': 'x', 'severity': 'critical'}]},
                    {**good, 'summary': ''}):
            with self.assertRaises(ValueError):
                insights.validate_review(bad)

    def test_the_overall_analysis_cites_only_reviews_it_was_given(self):
        value = overall([1, 2, 999])
        value['weaknesses'] = [{'title': 'Made up', 'detail': 'No evidence.', 'review_ids': [999, 'x']}]
        value['watch_list'].append({'review_id': 999, 'reason': 'Unknown.'})
        result = insights.validate_synthesis(value, {1, 2})
        self.assertEqual(result['common_issues'][0]['review_ids'], [1, 2])
        self.assertEqual(result['weaknesses'], [])   # no valid citation left: dropped, not shown
        self.assertEqual([w['review_id'] for w in result['watch_list']], [1])
        self.assertEqual(result['dropped'], 2)
        for bad in ({**value, 'confidence': 2}, {**value, 'headline': ''}, {k: v for k, v in value.items() if k != 'verdict'},
                    {**value, 'recommendations': [{'title': 'x', 'detail': 'y', 'priority': 'urgent', 'review_ids': [1]}]}):
            with self.assertRaises(ValueError):
                insights.validate_synthesis(bad, {1, 2})


@unittest.skipUnless(connections['default'].vendor == 'sqlite', 'Run with check_isolated_tests.py (in-memory SQLite only).')
class DashboardTests(TestCase):
    databases = {'default', 'login_db'}

    def setUp(self):
        patch = mock.patch('callcentre.views.refused', return_value=None)
        patch.start()
        self.addCleanup(patch.stop)
        users = get_user_model().objects
        self.director = users.create_user('director', is_superuser=True)
        self.agent = Agent.objects.create(user=users.create_user('alice'), display_name='Alice', zoom_email='alice@kbc.test',
                                          zoom_account='student')
        self.now = timezone.now()

    def case(self, name, status='new', eligible=True, **data):
        return CaseTicket.objects.create(
            source_type='learner_satisfaction', reason_key=f'learner_satisfaction:{uuid.uuid4()}', learner_email=f'{name}@x.test',
            learner_name=name.title(), programme=data.pop('programme', 'Data'), coach=data.pop('coach', 'Carol'),
            status=status, due_at=data.pop('due_at', self.now + timedelta(days=5)), source_data={'eligible': eligible, **data})

    def review(self, name, score, note='Happy with the course', problem='None', action='No action needed', days_ago=1, ticket=None, **data):
        ticket = ticket or self.case(name, status='resolved')
        done = self.now - timedelta(days=days_ago)
        ticket.source_data = {**ticket.source_data, 'last_completed_at': done.isoformat(),
                              'next_due_at': (done + timedelta(days=91)).isoformat()}
        ticket.save()
        event = TicketEvent.objects.create(ticket=ticket, kind='learner_feedback_completed', agent=self.agent, data={
            'score': score, 'note': note, 'problem': problem, 'agreed_action': action, 'completed_at': done.isoformat(), **data})
        return event

    def send(self, user, data=None, query=''):
        from .views import satisfaction_dashboard_view
        factory = RequestFactory()
        request = (factory.post('/', json.dumps(data), content_type='application/json') if data is not None
                   else factory.get(f'/{query}'))
        request.user, request._dont_enforce_csrf_checks = user, True
        response = satisfaction_dashboard_view(request)
        return response.status_code, json.loads(response.content)

    def test_one_review_per_case_newest_feedback_archived_left_out(self):
        ann = self.case('ann', status='resolved')
        self.review('ann', 2, ticket=ann, days_ago=5)
        newest = self.review('ann', 4, ticket=ann, days_ago=1)
        gone = self.case('gone', status='resolved')
        self.review('gone', 1, ticket=gone)
        CaseTicket.objects.filter(pk=gone.pk).update(archived=True)
        employer = CaseTicket.objects.create(source_type='employer_feedback', reason_key='employer:1', learner_email='m@x.test',
                                             learner_name='Manager', due_at=self.now)
        TicketEvent.objects.create(ticket=employer, kind='learner_feedback_completed', data={'score': 1, 'note': 'x' * 20})
        reviews = insights.completed_reviews()
        self.assertEqual([(r['id'], r['score']) for r in reviews], [(newest.pk, 4)])

    def test_call_flags_and_unattached_calls(self):
        linked = self.review('ann', 4, without_call=True)
        unlinked = self.review('ben', 5, without_call=True)
        flagged = self.review('cat', 3)
        TicketEvent.objects.create(ticket=linked.ticket, kind='feedback_call_linked', data={'feedback_event': linked.pk})
        TicketEvent.objects.create(ticket=flagged.ticket, kind='feedback_call_mismatch', data={'result': 'no_answer'})
        by_id = {r['id']: r for r in insights.completed_reviews()}
        self.assertFalse(by_id[linked.pk]['without_call'])
        self.assertTrue(by_id[unlinked.pk]['without_call'])
        self.assertTrue(by_id[flagged.pk]['call_flagged'])
        self.assertFalse(by_id[linked.pk]['call_flagged'])

    def test_coverage_counts_this_quarter_and_what_is_left(self):
        self.review('ann', 5)
        self.review('ben', 4, days_ago=120)   # its three months are over: due again, not done this quarter
        closed = self.case('cat', status='resolved', closed_without_feedback={'reason': 'unreachable'},
                           last_closed_at=self.now.isoformat(), next_due_at=(self.now + timedelta(days=80)).isoformat())
        self.case('dan')
        self.case('eve', due_at=self.now - timedelta(days=2), previous_case_id=closed.pk)
        self.case('fay', eligible=False)
        figures = insights.coverage(self.now)
        self.assertEqual((figures['done_this_quarter'], figures['closed_this_quarter'], figures['remaining']), (1, 1, 2))
        self.assertEqual((figures['overdue'], figures['first_review'], figures['not_eligible']), (1, 1, 1))
        self.assertEqual(figures['coverage_pct'], 25.0)
        self.assertEqual({row['reason']: row['count'] for row in figures['closed_reasons']}['unreachable'], 1)

    def test_only_a_director_sees_it_and_the_period_filters_the_figures(self):
        self.review('ann', 5, days_ago=2)
        self.review('ben', 2, days_ago=40, problem='LMS is hard to understand')
        self.assertEqual(self.send(self.agent.user)[0], 403)
        status, page = self.send(self.director, query='?period=30')
        self.assertEqual(status, 200)
        self.assertEqual(page['figures']['reviews'], 1)
        self.assertEqual(page['all_time']['reviews'], 2)
        self.assertEqual(len(page['reviews']), 2)   # every review; the page filters the list
        self.assertEqual(page['all_time']['issues_raised'], 1)
        self.assertFalse(page['ai']['enabled'])
        self.assertEqual(self.send(self.director, query='?period=7')[0], 400)
        self.assertEqual(self.send(self.director, {'action': 'analyse'})[0], 400)   # the AI is off

    @override_settings(**AI_ON)
    def test_every_review_is_read_then_all_are_analysed_together(self):
        events = [self.review(name, score, note=f'{name} feedback text') for name, score in (('ann', 5), ('ben', 2), ('cat', 4))]
        ids = sorted(e.pk for e in events)
        sent = []

        def fake(system, payload, max_tokens, **options):
            sent.append(payload)
            if 'figures' in payload:
                return overall(ids)
            return {'reviews': [reading(item['id'], concerns=[('lms_platform', 'high')] if item['score'] < 3 else [])
                                for item in payload['reviews']]}

        with mock.patch.object(insights, 'ask', side_effect=fake):
            self.assertEqual(insights.run(), {'read': 3, 'overall': 'ready'})
        # Nothing that names the learner goes to the AI.
        text = json.dumps(sent)
        for secret in ('Ann', 'ann@x.test', 'Carol'):
            self.assertNotIn(secret, text)
        self.assertEqual(sorted(r['id'] for r in sent[-1]['reviews']), ids)   # the overall analysis read all of them
        status, page = self.send(self.director)
        ai = page['ai']
        self.assertEqual((ai['read'], ai['total'], ai['failed']), (3, 3, 0))
        self.assertTrue(ai['insight']['up_to_date'])
        issue = ai['insight']['common_issues'][0]
        self.assertEqual(issue['count'], 3)
        self.assertEqual(issue['evidence'][0]['score'], 2)   # the lowest score is quoted first
        self.assertEqual(issue['evidence'][0]['quote'], 'ben feedback text')
        self.assertEqual(ai['insight']['watch_list'][0]['case_id'], {e.pk: e.ticket_id for e in events}[ids[0]])
        lms = next(row for row in page['concern_themes'] if row['theme'] == 'lms_platform')
        self.assertEqual((lms['concerns'], lms['serious']), (1, 1))
        self.assertEqual(page['sentiments']['positive'], 3)

        # Nothing new: no AI call. A new review is read at once; the overall analysis waits for the hourly gap.
        with mock.patch.object(insights, 'ask', side_effect=fake) as asked:
            self.assertEqual(insights.run(), {'read': 0})
            self.review('dan', 4)
            self.assertEqual(insights.run(), {'read': 1})
            self.assertEqual(asked.call_count, 1)
        self.assertFalse(self.send(self.director)[1]['ai']['insight']['up_to_date'])
        SatisfactionInsight.objects.update(created_at=self.now - timedelta(hours=2))
        with mock.patch.object(insights, 'ask', side_effect=fake):
            self.assertEqual(insights.run(), {'read': 0, 'overall': 'ready'})
        self.assertEqual(SatisfactionInsight.objects.count(), 2)

    @override_settings(**AI_ON)
    def test_a_review_the_ai_cannot_answer_for_is_retried_only_when_a_director_asks(self):
        good, bad = self.review('ann', 5), self.review('ben', 1)

        def fake(system, payload, max_tokens, **options):
            if 'figures' in payload:
                return overall([good.pk])
            if any(item['id'] == bad.pk for item in payload['reviews']):
                raise ValueError('AI response incomplete.')
            return {'reviews': [reading(item['id']) for item in payload['reviews']]}

        with mock.patch.object(insights, 'ask', side_effect=fake) as asked:
            self.assertEqual(insights.run()['read'], 1)   # the batch failed, then each review on its own
            self.assertEqual(SatisfactionAI.objects.get(event=bad).state, 'error')
            calls = asked.call_count
            insights.run()
            self.assertEqual(asked.call_count, calls)   # not sent again on its own
        self.assertEqual(self.send(self.director)[1]['ai']['failed'], 1)
        self.assertTrue(insights.ask_for_analysis('director'))
        self.assertFalse(insights.ask_for_analysis('director'))   # once a minute
        self.assertTrue(insights.analysis_requested())
        self.assertTrue(self.send(self.director)[1]['ai']['requested'])
        with mock.patch.object(insights, 'ask', side_effect=fake) as asked:
            result = insights.run()
            self.assertEqual(result['overall'], 'ready')
            self.assertEqual(asked.call_args_list[0].args[1]['reviews'][0]['id'], bad.pk)   # retried
        self.assertFalse(insights.analysis_requested())
        self.assertEqual(SatisfactionInsight.objects.latest('id').requested_by, 'director')

    @override_settings(**AI_ON)
    def test_a_failed_overall_analysis_keeps_the_last_good_one(self):
        event = self.review('ann', 4)
        with mock.patch.object(insights, 'ask', side_effect=[{'reviews': [reading(event.pk)]}, overall([event.pk])]):
            insights.run()
        self.review('ben', 3)
        insights.ask_for_analysis('director')
        with mock.patch.object(insights, 'ask', side_effect=lambda system, payload, tokens, **options:
                               overall([1], headline='') if 'figures' in payload else {'reviews': [reading(payload['reviews'][0]['id'])]}):
            self.assertEqual(insights.run()['overall'], 'error')
        ai = self.send(self.director)[1]['ai']
        self.assertEqual(ai['insight']['state'], 'ready')
        self.assertFalse(ai['insight']['up_to_date'])
        self.assertEqual(ai['failure']['state'], 'error')

    @override_settings(**AI_ON)
    def test_a_request_made_while_an_analysis_runs_is_not_lost(self):
        self.review('ann', 4)

        def fake(system, payload, max_tokens, **options):
            if 'figures' not in payload:
                insights.ask_for_analysis('director')   # asked while this run is under way
                return {'reviews': [reading(item['id']) for item in payload['reviews']]}
            return overall([payload['reviews'][0]['id']])

        with mock.patch.object(insights, 'ask', side_effect=fake):
            insights.run()
        self.assertTrue(insights.analysis_requested())
        CycleState.objects.filter(name=insights.LEASE).update(locked_until=self.now + timedelta(minutes=5))
        self.assertEqual(insights.run(), {'skipped': 'Another satisfaction analysis is running.'})
