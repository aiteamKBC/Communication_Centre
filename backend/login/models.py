from django.contrib.auth.models import Group

from .permissions import PERMISSION_DEFINITIONS


class CommunicationAccess(Group):
    """A real content type for app permissions, using the existing Group table."""

    class Meta:
        proxy = True
        default_permissions = ()
        permissions = PERMISSION_DEFINITIONS
        verbose_name = 'Communication Centre access'
        verbose_name_plural = 'Communication Centre access'
