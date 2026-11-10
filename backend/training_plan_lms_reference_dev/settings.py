"""Isolated local application settings; never load production settings or .env."""
import json
from pathlib import Path
import socket

BASE_DIR = Path(__file__).resolve().parent.parent
PRIVATE = Path(__file__).resolve().parent / 'private'
_receipt = json.loads((PRIVATE / 'isolation.json').read_text(encoding='utf-8'))
_state = json.loads((PRIVATE / 'state.json').read_text(encoding='utf-8'))
if _receipt['host'] != '127.0.0.1' or _receipt['port'] != 55432 or not _receipt['sanitised']:
    raise RuntimeError('The Training Plan test database has not passed isolation checks.')
_expected = {'default': 'tp_lms_reference_app', 'login_db': 'tp_lms_reference_auth'}
if _receipt['databases'] != _expected:
    raise RuntimeError('Unexpected test database destination.')
DATABASES = {alias: {
    'ENGINE': 'django.db.backends.postgresql', 'HOST': '127.0.0.1', 'PORT': '55432',
    'NAME': name, 'USER': 'tp_lms_test_app', 'PASSWORD': _state['password'],
    'CONN_MAX_AGE': 0, 'OPTIONS': {'connect_timeout': 5},
} for alias, name in _expected.items()}
DATABASE_ROUTERS = ['backend.db_routers.AuthAdminRouter']
_lms_file = PRIVATE / 'lms-reader.json'
if _lms_file.exists():
    TRAINING_PLAN_LMS_REFERENCE_SOURCE = json.loads(_lms_file.read_text(encoding='utf-8'))
    if (TRAINING_PLAN_LMS_REFERENCE_SOURCE['host'], TRAINING_PLAN_LMS_REFERENCE_SOURCE['port'], TRAINING_PLAN_LMS_REFERENCE_SOURCE['dbname']) != ('127.0.0.1', 55432, 'tp_lms_reference_source'):
        raise RuntimeError('LMS reference source must be the verified local copy.')
SECRET_KEY = 'isolated-training-plan-lms-' + _state['password']
DEBUG = True
ALLOWED_HOSTS = ['127.0.0.1', 'localhost', 'testserver']
INSTALLED_APPS = [
    'django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes',
    'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles',
    'api', 'login', 'callcentre',
]
MIDDLEWARE = [
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware', 'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'login.middleware.ApiLoginRequiredMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
]
ROOT_URLCONF = 'backend.urls'
AUTHENTICATION_BACKENDS = ['login.backends.LoginDBModelBackend']
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'APP_DIRS': True,
              'OPTIONS': {'context_processors': ['django.template.context_processors.request',
                  'django.contrib.auth.context_processors.auth',
                  'django.contrib.messages.context_processors.messages']}}]
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
USE_TZ = True
TIME_ZONE = 'UTC'
STATIC_URL = '/static/'
MEDIA_URL = '/media/'
MEDIA_ROOT = PRIVATE / 'media'
CSRF_TRUSTED_ORIGINS = ['http://127.0.0.1:3100', 'http://localhost:3100']
SESSION_COOKIE_NAME = 'tp_lms_reference_test_session'
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
CALLCENTRE_EMAIL_MODE = 'dry_run'
CALLCENTRE_EMAIL_LIVE_ALLOWED = False
CALLCENTRE_REMINDERS_ENABLED = False
CALLCENTRE_AI_ENABLED = False
ZOOM_AI_TRANSCRIPTION_ENABLED = False
CALLCENTRE_HELPDESK_URL = ''
CALLCENTRE_PUBLIC_URL = ''
CALLCENTRE_MAIL_SENDER = 'test@example.invalid'
OPENAI_API_KEY = ''

_connect = socket.socket.connect


def _local_only_connect(sock, address):
    if not isinstance(address, tuple) or address[0] not in ('127.0.0.1', '::1', 'localhost'):
        raise OSError('External network access is disabled for Training Plan tests.')
    return _connect(sock, address)


socket.socket.connect = _local_only_connect
