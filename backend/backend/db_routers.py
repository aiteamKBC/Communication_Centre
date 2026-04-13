from django.conf import settings


class AuthAdminRouter:
    """Route Django auth/admin/contenttypes models to login_db when configured."""

    route_app_labels = {'auth', 'admin', 'contenttypes'}

    @staticmethod
    def _target_db() -> str:
        return 'login_db' if 'login_db' in settings.DATABASES else 'default'

    def db_for_read(self, model, **hints):
        if model._meta.app_label in self.route_app_labels:
            return self._target_db()
        return None

    def db_for_write(self, model, **hints):
        if model._meta.app_label in self.route_app_labels:
            return self._target_db()
        return None

    def allow_relation(self, obj1, obj2, **hints):
        if (
            obj1._meta.app_label in self.route_app_labels
            or obj2._meta.app_label in self.route_app_labels
        ):
            return obj1._state.db == obj2._state.db
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label in self.route_app_labels:
            return db == self._target_db()
        return None
