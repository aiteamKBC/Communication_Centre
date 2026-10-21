from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase

from .access import ACCESS_GROUPS, LEGACY_CALL_CENTRE_GROUP, ensure_access_groups


class CallCentreAccessGroupTests(TestCase):
	databases = {'default', 'login_db'}

	def test_the_old_call_centre_group_becomes_the_agent_group_with_its_members(self):
		group = Group.objects.using('login_db').create(name=LEGACY_CALL_CENTRE_GROUP)
		user = get_user_model().objects.db_manager('login_db').create_user('agent', 'agent@example.com', 'pw')
		user.groups.add(group)

		ensure_access_groups('login_db')

		names = set(user.groups.using('login_db').values_list('name', flat=True))
		self.assertEqual(names, {ACCESS_GROUPS['access_call_centre_agent']})
		self.assertFalse(Group.objects.using('login_db').filter(name=LEGACY_CALL_CENTRE_GROUP).exists())
		self.assertTrue(Group.objects.using('login_db').filter(name=ACCESS_GROUPS['access_call_centre_director']).exists())
