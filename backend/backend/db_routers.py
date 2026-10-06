import sys

from django.conf import settings


class CallCentreRouter:
    """Send the call-centre app to login_db, the database that already holds its tables.

    The tables were created by the legacy dashboard and are shared with auth_user, so
    Django must never migrate them from here.
    """

    app_label = 'callcentre'
    using = 'login_db'

    def db_for_read(self, model, **hints):
        return self.using if model._meta.app_label == self.app_label else None

    def db_for_write(self, model, **hints):
        return self.using if model._meta.app_label == self.app_label else None

    def allow_relation(self, obj1, obj2, **hints):
        labels = {obj1._meta.app_label, obj2._meta.app_label}
        if self.app_label in labels and labels <= {self.app_label, 'auth'}:
            return True
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        return False if app_label == self.app_label else None


class ExternalDbRouter:
    """Route read-only external models to their configured databases."""

    _model_db = {
        'supportticket': 'safeguarding_db',
        'riskregisteritem': 'ofsted_db',
        'aptemautoextracting': 'aptem_db',
    }

    def _configured_db_for_model(self, model):
        if 'test' in sys.argv:
            return None
        db_alias = self._model_db.get(model.__name__.lower())
        if db_alias and db_alias in settings.DATABASES:
            return db_alias
        return None

    def db_for_read(self, model, **hints):
        return self._configured_db_for_model(model)

    def db_for_write(self, model, **hints):
        return self._configured_db_for_model(model)

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if model_name and model_name.lower() in self._model_db and self._model_db[model_name.lower()] in settings.DATABASES:
            return False
        return None


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
