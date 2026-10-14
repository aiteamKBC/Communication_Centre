"""Run the existing backend tests without loading .env or reaching live services.

Usage: python check_isolated_tests.py [test.module ...]
Unmanaged legacy tables are provisioned only in two in-memory SQLite databases.
This checks application behaviour, not production migrations or PostgreSQL SQL.
"""
import logging
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


def main():
    import django
    from django.conf import settings

    if settings.configured:
        raise RuntimeError('Use a fresh process; project settings must not be loaded.')
    settings.configure(
        SECRET_KEY='isolated-tests-not-for-deployment', DEBUG=False, USE_TZ=True,
        DEFAULT_AUTO_FIELD='django.db.models.BigAutoField',
        BASE_DIR=Path(__file__).resolve().parent,
        INSTALLED_APPS=[
            'django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes',
            'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles',
            'api', 'login', 'callcentre',
        ],
        DATABASES={name: {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}
                   for name in ('default', 'login_db')},
        DATABASE_ROUTERS=[],
        MIDDLEWARE=[
            'django.contrib.sessions.middleware.SessionMiddleware',
            'django.contrib.auth.middleware.AuthenticationMiddleware',
            'django.contrib.messages.middleware.MessageMiddleware',
        ],
        ROOT_URLCONF='backend.urls', ALLOWED_HOSTS=['testserver', 'localhost'],
        STATIC_URL='/static/', MEDIA_URL='/media/',
        TEMPLATES=[{'BACKEND': 'django.template.backends.django.DjangoTemplates',
                    'APP_DIRS': True, 'OPTIONS': {'context_processors': [
                        'django.template.context_processors.request',
                        'django.contrib.auth.context_processors.auth',
                        'django.contrib.messages.context_processors.messages']}}],
        CALLCENTRE_EMAIL_MODE='dry_run', CALLCENTRE_REMINDERS_ENABLED=False,
        CALLCENTRE_REMINDER_DAYS=[0, 2, 5, 7], CALLCENTRE_REMINDER_ESCALATE_DAY=7,
        CALLCENTRE_REMINDER_TYPES={'attendance', 'pr', 'mcm', 'pr_missed', 'mcm_missed',
                                  'signature', 'satisfaction'},
        CALLCENTRE_EMAIL_DAILY_CAP=2, CALLCENTRE_ESCALATION_EMAIL='', CALLCENTRE_PUBLIC_URL='',
        CALLCENTRE_MAIL_SENDER='no-reply@kentbusinesscollege.com',
        CALLCENTRE_CONFIRMED_TEST_IDENTIFIERS=[], CALLCENTRE_HOLIDAYS=[],
        CALLCENTRE_AI_ENABLED=False,
    )
    django.setup()
    from django.apps import apps
    from django.db import connections
    from django.test.utils import setup_test_environment, teardown_test_environment

    setup_test_environment()
    # Keep expected validation warnings quiet without disabling assertLogs checks.
    logging.getLogger().addHandler(logging.NullHandler())
    try:
        with patch('socket.socket.connect', side_effect=AssertionError('Test attempted external network access')):
            for connection in connections.all():
                assert connection.vendor == 'sqlite' and connection.settings_dict['NAME'] == ':memory:'
                with connection.schema_editor() as editor:
                    for model in apps.get_models():
                        editor.create_model(model)
            modules = sys.argv[1:] or ['api.tests', 'login.tests', 'callcentre.tests',
                                      'callcentre.test_learner_satisfaction', 'callcentre.test_source_bridge', 'callcentre.test_identity',
                                      'callcentre.test_call_flow']
            suite = unittest.defaultTestLoader.loadTestsFromNames(modules)
            result = unittest.TextTestRunner(verbosity=1).run(suite)
        return 0 if result.wasSuccessful() else 1
    finally:
        connections.close_all()
        teardown_test_environment()


if __name__ == '__main__':
    sys.exit(main())
