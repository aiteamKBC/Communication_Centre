"""Create a preview account only in the verified isolated test copies.

Credentials are written to an ignored private file and are never printed.
"""
import json
import os
from pathlib import Path
import secrets

os.environ['DJANGO_SETTINGS_MODULE'] = 'training_plan_lms_reference_dev.settings'


def main():
    from .verify import main as verify
    verify()
    from django.contrib.auth import get_user_model
    from django.contrib.auth.models import Group

    path = Path(__file__).resolve().parent / 'private' / 'preview-access.json'
    if path.exists():
        print('Existing preview account credentials retained in the ignored private file.')
        return
    username = 'training-plan-local-preview'
    if get_user_model().objects.using('login_db').filter(username=username).exists():
        raise RuntimeError('An account with the preview name already exists; refusing to change its password.')
    group = Group.objects.using('login_db').filter(name='Operations Access').first()
    if not group:
        raise RuntimeError('Existing Training Plan management group was not restored.')
    password = secrets.token_urlsafe(24)
    email = 'training-plan-preview@example.invalid'
    user = get_user_model().objects.db_manager('login_db').create_user(
        username=username, email=email, password=password, first_name='Training Plan', last_name='Preview')
    user.groups.add(group)
    path.write_text(json.dumps({'url': 'http://127.0.0.1:3100/login', 'email': email, 'password': password}, indent=2), encoding='utf-8')
    print('Isolated preview account ready. Credentials saved in the ignored private preview-access.json file.')


if __name__ == '__main__':
    main()
