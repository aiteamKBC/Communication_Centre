from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.db import connections


class LoginDBModelBackend(ModelBackend):
    """Authenticate against the same login_db used by API login endpoints."""

    using = 'login_db'

    def authenticate(self, request, username=None, password=None, **kwargs):
        if self.using not in connections:
            return None

        user_model = get_user_model()
        if username is None:
            username = kwargs.get(user_model.USERNAME_FIELD)
        if username is None or password is None:
            return None

        db_manager = user_model._default_manager.db_manager(self.using)
        try:
            user = db_manager.get_by_natural_key(username)
        except user_model.DoesNotExist:
            return None

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None

    def get_user(self, user_id):
        if self.using not in connections:
            return None

        user_model = get_user_model()
        try:
            return user_model._default_manager.db_manager(self.using).get(pk=user_id)
        except user_model.DoesNotExist:
            return None
