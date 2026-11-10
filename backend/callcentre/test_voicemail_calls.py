from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from . import voicemail_calls as vm


def call(result='answered', voicemail='', duration=40):
    match = SimpleNamespace(voicemail=voicemail, pk=1)
    found = SimpleNamespace(result=result, callmatch=match, duration_seconds=duration)
    match.call = found
    return found


class GreetingTests(SimpleTestCase):
    def test_greetings_are_voicemails(self):
        for text in ("Hi, you've reached Sarah. I can't take your call right now, please leave a message after the tone.",
                     'The person you are calling is not available. Please record your message.',
                     'Welcome to the Vodafone voicemail of 07700 900123.'):
            with self.subTest(text=text):
                self.assertTrue(vm.looks_like_voicemail(text))

    def test_conversations_are_not(self):
        self.assertFalse(vm.looks_like_voicemail('Hello? Yes, speaking. I got your voicemail yesterday, thanks.'))
        # A greeting phrase said late in a long conversation is not read.
        self.assertFalse(vm.looks_like_voicemail('Hello, yes this is Amy. ' + 'We talked about the review. ' * 20 + 'leave a message'))
        self.assertFalse(vm.looks_like_voicemail(''))


class ResultTests(SimpleTestCase):
    def test_a_marked_answered_call_is_a_voicemail(self):
        self.assertEqual(vm.effective_result(call(voicemail='specialist')), 'voicemail')
        self.assertFalse(vm.reached(call(voicemail='transcript')))
        self.assertEqual(vm.effective_result(call()), 'answered')
        self.assertTrue(vm.reached(call()))
        self.assertEqual(vm.effective_result(call('cut_off', 'specialist')), 'cut_off')   # Zoom's own failure stands
        self.assertEqual(vm.effective_result(SimpleNamespace(result='answered')), 'answered')   # no match: Zoom's word

    def test_reached_on_a_voicemail_is_questioned_but_no_answer_is_not(self):
        from .services import check_call_result
        check_call_result('no_answer', call(voicemail='transcript'))
        with self.assertRaisesMessage(ValueError, 'Zoom must confirm an answered call.'):
            check_call_result('reached', call(voicemail='transcript'))

    def test_only_an_answered_unmarked_call_is_marked(self):
        with patch('callcentre.voicemail_calls.CallMatch.objects.filter') as update:
            for found in (call('no_answer'), call(voicemail='transcript')):
                vm.mark(found.callmatch, vm.SPECIALIST)
            update.assert_not_called()
            found = call()
            vm.mark(found.callmatch, vm.SPECIALIST)
            update.assert_called_once_with(pk=1, voicemail='')
            update.return_value.update.assert_called_once_with(voicemail='specialist')
            self.assertEqual(found.callmatch.voicemail, 'specialist')


class DetectTests(SimpleTestCase):
    def detect(self, text, duration):
        recording = SimpleNamespace(transcript_text=text)
        found = call(duration=duration)
        calls = MagicMock()
        calls.filter.return_value.select_related.return_value.first.return_value = found
        with patch('callcentre.voicemail_calls.ZoomPhoneRecording.objects.filter') as recordings, \
                patch('callcentre.voicemail_calls.system_calls', return_value=calls), \
                patch('callcentre.voicemail_calls.recording_call_filter'), \
                patch('callcentre.voicemail_calls.mark') as mark:
            recordings.return_value.exclude.return_value.iterator.return_value = [recording]
            return vm.detect(), mark

    def test_a_short_call_with_a_greeting_is_marked(self):
        count, mark = self.detect('Please leave a message after the beep.', 35)
        self.assertEqual(count, 1)
        mark.assert_called_once()

    def test_a_long_call_or_a_conversation_is_not(self):
        self.assertEqual(self.detect('Please leave a message after the beep.', 300)[0], 0)
        self.assertEqual(self.detect('Hello, Amy speaking.', 35)[0], 0)
