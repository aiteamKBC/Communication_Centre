"""Session-authenticated administration of the existing Django users and access groups.

All account changes and their native Django admin history are written together to
login_db. The browser never supplies the identity or privileges of the administrator.
"""

import json
from contextlib import contextmanager
from functools import wraps

from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.contrib.auth import get_user_model, update_session_auth_hash
from django.contrib.auth.models import Group, Permission
from django.contrib.auth.password_validation import validate_password
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.db.models import Prefetch, Q, Value
from django.db.models.deletion import ProtectedError, RestrictedError
from django.db.models.functions import Concat
from django.http import JsonResponse
from django.utils.crypto import constant_time_compare, salted_hmac
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.debug import sensitive_post_parameters

from .access import ACCESS_GROUPS, LEGACY_CALL_CENTRE_GROUP
from .permissions import (
    SAFE_PERMISSION_CODES, ensure_permission_catalog, legacy_role_permissions,
    permission_catalog,
)


DB = 'login_db'
ADMIN_ROLE = 'access_admin'
AGENT_ROLE = 'access_call_centre_agent'
ROLE_DETAILS = {
    'access_admin': ('Communication Centre admin', 'Includes the Communication Centre department roles.', 'communication'),
    'access_event_manager': ('Events', 'Create and manage events.', 'communication'),
    'access_operations': ('Operations', 'Manage training plans and cohorts.', 'communication'),
    'access_it': ('IT', 'Manage news and view user activity.', 'communication'),
    'access_marketing': ('Marketing', 'Manage news and announcements.', 'communication'),
    'access_support': ('Support', 'Access Support features.', 'communication'),
    'access_coach': ('Coach', 'Access Communication Centre coach features.', 'communication'),
    'access_call_centre_agent': ('Specialist', 'Work from their own Engagement Centre calling desk.', 'engagement'),
    'access_call_centre_director': ('Director', 'Manage desks, allocation and settings.', 'engagement'),
    'access_call_centre_coach': ('Engagement coach', 'View and support their assigned learners.', 'engagement'),
}
USER_FIELDS = {
    'username': 'username', 'email': 'email', 'firstName': 'first_name', 'lastName': 'last_name',
    'isActive': 'is_active', 'isStaff': 'is_staff', 'isSuperuser': 'is_superuser',
}
FIELD_LABELS = {
    'username': 'username', 'email': 'email', 'firstName': 'first name', 'lastName': 'last name',
    'isActive': 'account status', 'isStaff': 'Django administration access',
    'isSuperuser': 'Django superuser access',
}


class AdministrationError(Exception):
    def __init__(self, detail, status=400, errors=None):
        self.detail = detail
        self.status = status
        self.errors = errors


def _users():
    return get_user_model().objects.using(DB)


def _group_names(user):
    if hasattr(user, '_administration_groups'):
        return [group.name for group in user._administration_groups]
    return list(user.groups.using(DB).order_by('name').values_list('name', flat=True))


def _groups(user):
    if not user.pk:
        return []
    if hasattr(user, '_administration_groups'):
        return user._administration_groups
    return list(user.groups.using(DB).prefetch_related('permissions__content_type').order_by('name'))


def _role_key(group):
    return next((key for key, name in ACCESS_GROUPS.items() if name == group.name), f'group:{group.pk}')


def _safe_permission(permission):
    return (permission.content_type.app_label == 'login'
            and permission.content_type.model == 'communicationaccess'
            and f'login.{permission.codename}' in SAFE_PERMISSION_CODES)


def _permission_code(permission):
    return f'{permission.content_type.app_label}.{permission.content_type.model}.{permission.codename}'


def _django_permission_catalog():
    return [
        {'id': _permission_code(permission), 'name': permission.name,
         'appLabel': permission.content_type.app_label,
         'model': permission.content_type.model}
        for permission in Permission.objects.using(DB).select_related('content_type').order_by(
            'content_type__app_label', 'content_type__model', 'codename')
    ]


def _unsafe_group_permissions(group):
    return [permission for permission in group.permissions.all() if not _safe_permission(permission)]


def _permission_ids(user):
    if hasattr(user, '_administration_permissions'):
        return [permission.pk for permission in user._administration_permissions]
    return list(user.user_permissions.using(DB).order_by('pk').values_list('pk', flat=True))


def _role_ids(user):
    return [_role_key(group) for group in _groups(user)]


def _role_group(role):
    if role in ACCESS_GROUPS:
        return Group.objects.using(DB).filter(name=ACCESS_GROUPS[role]).first()
    if isinstance(role, str) and role.startswith('group:') and role[6:].isdigit():
        group = Group.objects.using(DB).filter(pk=int(role[6:])).first()
        if group is not None and group.name not in ACCESS_GROUPS.values():
            return group
    return None


def _role_label(role):
    if role in ROLE_DETAILS:
        return ROLE_DETAILS[role][0]
    group = _role_group(role)
    return group.name if group else 'Removed role'


def _is_administrator(user):
    return bool(user and user.is_active and (
        user.is_superuser or user.groups.using(DB).filter(name=ACCESS_GROUPS[ADMIN_ROLE]).exists()
    ))


def _privileged(user):
    if user.is_staff or user.is_superuser:
        return True
    direct = (user._administration_permissions if hasattr(user, '_administration_permissions')
              else user.user_permissions.using(DB).select_related('content_type'))
    return any(not _safe_permission(permission) for permission in direct) or any(
        _unsafe_group_permissions(group) for group in _groups(user)
    )


def _can_edit(actor, user):
    return bool(actor.is_superuser or not _privileged(user))


def _require_edit(actor, user):
    if not _can_edit(actor, user):
        raise AdministrationError('Only a Django superuser can change this privileged account.', 403)


def _actor(request):
    signed_in = getattr(request, 'user', None)
    if not signed_in or not signed_in.is_authenticated:
        raise AdministrationError('Sign in again to continue.', 401)
    user = _users().filter(pk=signed_in.pk).first()
    if user is None or not user.is_active:
        raise AdministrationError('Sign in again to continue.', 401)
    if not _is_administrator(user):
        raise AdministrationError('Administrator access is required.', 403)
    return user


def administrator_view(methods):
    def decorate(view):
        @wraps(view)
        @never_cache
        @csrf_protect
        def guarded(request, *args, **kwargs):
            try:
                actor = _actor(request)
                if request.method not in methods:
                    response = JsonResponse({'detail': 'Method not allowed.'}, status=405)
                    response['Allow'] = ', '.join(methods)
                    return response
                return view(request, actor, *args, **kwargs)
            except AdministrationError as error:
                body = {'detail': error.detail}
                if error.errors:
                    body['errors'] = error.errors
                return JsonResponse(body, status=error.status)
            except (ProtectedError, RestrictedError):
                return JsonResponse({'detail': 'This account has retained records and cannot be deleted. Deactivate it instead.'}, status=409)
            except IntegrityError:
                return JsonResponse({'detail': 'The change conflicts with an existing account or related record. Refresh and try again.'}, status=409)
        return guarded
    return decorate


def _body(request):
    if len(request.body) > 65536:
        raise AdministrationError('The request is too large.', 413)
    if request.content_type != 'application/json':
        raise AdministrationError('Send an application/json request.')
    try:
        payload = json.loads(request.body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise AdministrationError('The request contains invalid JSON.') from None
    if not isinstance(payload, dict):
        raise AdministrationError('The request must be a JSON object.')
    return payload


def _pagination(request):
    try:
        page = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('pageSize', 20))
    except (ValueError, TypeError):
        raise AdministrationError('Page and pageSize must be whole numbers.') from None
    if page < 1 or not 1 <= page_size <= 100:
        raise AdministrationError('Page must be positive and pageSize must be between 1 and 100.')
    return page, page_size


def _revision(user):
    # The password hash contributes to conflict detection, but is never returned.
    data = {
        'id': user.pk,
        **{field: getattr(user, field) for field in USER_FIELDS.values()},
        'groups': [(group.pk, group.name, sorted(permission.pk for permission in group.permissions.all()))
                   for group in _groups(user)],
        'permissions': _permission_ids(user),
        'password': user.password,
    }
    return salted_hmac('login.administration.revision', json.dumps(data, sort_keys=True), algorithm='sha256').hexdigest()


def _check_revision(user, payload):
    revision = payload.get('revision')
    if not isinstance(revision, str) or not revision or not constant_time_compare(revision, _revision(user)):
        raise AdministrationError('This account has changed. Refresh it before saving your changes.', 409)


def _serialize_user(user, actor, *, other_superusers=None):
    groups = _group_names(user)
    role_ids = _role_ids(user)
    can_edit = _can_edit(actor, user)
    can_delete = can_edit and actor.pk != user.pk
    if user.is_superuser and user.is_active:
        alternatives = (any(pk != user.pk for pk in other_superusers) if other_superusers is not None
                        else _users().filter(is_superuser=True, is_active=True).exclude(pk=user.pk).exists())
        if not alternatives:
            can_delete = False
    result = {
        'id': user.pk, 'username': user.username, 'email': user.email,
        'firstName': user.first_name, 'lastName': user.last_name,
        'displayName': user.get_full_name().strip() or user.username or user.email,
        'isActive': bool(user.is_active), 'isStaff': bool(user.is_staff), 'isSuperuser': bool(user.is_superuser),
        'roles': role_ids, 'otherGroups': [name for name in groups if name not in ACCESS_GROUPS.values()],
        'lastLogin': user.last_login.isoformat() if user.last_login else None,
        'dateJoined': user.date_joined.isoformat() if user.date_joined else None,
        'revision': _revision(user), 'canEdit': can_edit, 'canDelete': can_delete,
    }
    if actor.is_superuser:
        direct = (user._administration_permissions if hasattr(user, '_administration_permissions')
                  else user.user_permissions.using(DB).select_related('content_type'))
        result['directPermissions'] = sorted(_permission_code(permission) for permission in direct)
    return result


@contextmanager
def _mutation(request, target_id=None):
    with transaction.atomic(using=DB):
        # A common lock serializes administration mutations, including changes to
        # different administrators, so concurrent requests cannot remove the last one.
        group, _ = Group.objects.using(DB).get_or_create(name=ACCESS_GROUPS[ADMIN_ROLE])
        Group.objects.using(DB).select_for_update().get(pk=group.pk)
        actor = _actor(request)
        ids = [actor.pk] if target_id is None else sorted({actor.pk, target_id})
        locked = {user.pk: user for user in _users().select_for_update().filter(pk__in=ids).order_by('pk')}
        actor = locked.get(actor.pk)
        if not _is_administrator(actor):
            raise AdministrationError('Administrator access is required.', 403)
        target = None if target_id is None else locked.get(target_id)
        if target_id is not None and target is None:
            raise AdministrationError('This user no longer exists.', 404)
        yield actor, target


def _validate_payload(payload, actor, user, *, creating=False):
    allowed = set(USER_FIELDS) | {'roles', 'password', 'directPermissions'} | (set() if creating else {'revision'})
    if set(payload) - allowed:
        raise AdministrationError('The request contains unsupported fields.')
    if not actor.is_superuser and ({'isStaff', 'isSuperuser'} & set(payload)):
        raise AdministrationError('Only a Django superuser can change Django administration privileges.', 403)
    if not actor.is_superuser and 'directPermissions' in payload:
        raise AdministrationError('Only a Django superuser can change direct Django permissions.', 403)
    errors = {}
    values = {}
    required = {'username', 'email', 'password'} if creating else set()
    for key in required:
        if key not in payload:
            errors[key] = ['This field is required.']
    for key, field_name in USER_FIELDS.items():
        if key not in payload:
            continue
        value = payload[key]
        if key.startswith('is'):
            if not isinstance(value, bool):
                errors[key] = ['Choose true or false.']
            else:
                values[field_name] = value
            continue
        if not isinstance(value, str):
            errors[key] = ['Enter text.']
            continue
        value = value.strip()
        if key in ('username', 'email') and not value:
            errors[key] = ['This field is required.']
            continue
        try:
            get_user_model()._meta.get_field(field_name).clean(value, user)
            if key == 'email':
                validate_email(value)
                value = get_user_model().objects.normalize_email(value)
        except ValidationError as error:
            errors[key] = error.messages
            continue
        if key in ('username', 'email') and _users().filter(**{f'{field_name}__iexact': value}).exclude(pk=user.pk).exists():
            errors[key] = [f'This {key} is already used by another account.']
        else:
            values[field_name] = value
    roles = payload.get('roles', [] if creating else _role_ids(user))
    if not isinstance(roles, list) or any(
        not isinstance(role, str) or (role not in ACCESS_GROUPS and _role_group(role) is None)
        for role in roles
    ):
        errors['roles'] = ['Select only the available roles.']
        roles = []
    roles = list(dict.fromkeys(roles))
    if not actor.is_superuser and any(
        group is not None and _unsafe_group_permissions(group)
        for group in (_role_group(role) for role in roles)
    ):
        raise AdministrationError('Only a Django superuser can assign roles with advanced Django permissions.', 403)
    if creating or {'isStaff', 'isSuperuser'} & set(payload):
        if values.get('is_superuser', user.is_superuser) and not values.get('is_staff', user.is_staff):
            errors['isStaff'] = ['Django superusers must also have Django administration access.']
    password = payload.get('password')
    if 'password' in payload:
        if not isinstance(password, str) or not password.strip() or len(password) > 1024:
            errors['password'] = ['Enter a password between 1 and 1024 characters.']
        else:
            # Validate against the edited identity too, so username similarity checks
            # do not accidentally use the account's previous name.
            candidate = get_user_model()(**{field: values.get(field, getattr(user, field)) for field in USER_FIELDS.values()})
            try:
                validate_password(password, candidate)
            except ValidationError as error:
                errors['password'] = error.messages
    if errors:
        raise AdministrationError('Check the highlighted fields.', errors=errors)
    direct_permissions = None
    if 'directPermissions' in payload:
        codes = payload.get('directPermissions')
        if not isinstance(codes, list) or any(not isinstance(code, str) for code in codes):
            errors['directPermissions'] = ['Select valid Django permissions.']
            codes = []
        permission_map = {_permission_code(permission): permission for permission in
                          Permission.objects.using(DB).select_related('content_type')}
        unknown = sorted(set(codes) - set(permission_map))
        if unknown:
            errors['directPermissions'] = ['One or more selected Django permissions no longer exist.']
        direct_permissions = [permission_map[code] for code in dict.fromkeys(codes) if code in permission_map]
    if errors:
        raise AdministrationError('Check the highlighted fields.', errors=errors)
    return values, roles, password, direct_permissions


def _protect_administrators(actor, user, values, roles, *, deleting=False):
    old_roles = _role_ids(user)
    active = values.get('is_active', user.is_active) and not deleting
    superuser = values.get('is_superuser', user.is_superuser) and not deleting
    app_admin = ADMIN_ROLE in roles and not deleting
    if actor.pk == user.pk:
        removing_own_admin = ADMIN_ROLE in old_roles and not app_admin
        removing_own_superuser = user.is_superuser and not superuser
        removing_own_staff = user.is_staff and not values.get('is_staff', user.is_staff)
        if deleting or not active or removing_own_admin or removing_own_superuser or removing_own_staff:
            raise AdministrationError('You cannot delete, deactivate or remove administrator access from your own account.', 409)
    if user.is_active and user.is_superuser and not (active and superuser):
        if not _users().filter(is_active=True, is_superuser=True).exclude(pk=user.pk).exists():
            raise AdministrationError('Keep at least one active Django superuser.', 409)
    if user.is_active and user.is_superuser and user.is_staff:
        if not (active and superuser and values.get('is_staff', user.is_staff)):
            if not _users().filter(is_active=True, is_superuser=True, is_staff=True).exclude(pk=user.pk).exists():
                raise AdministrationError('Keep at least one active Django superuser with Django administration access.', 409)
    if _is_administrator(user) and not (active and (superuser or app_admin)):
        if not _users().filter(is_active=True).filter(Q(is_superuser=True) | Q(groups__name=ACCESS_GROUPS[ADMIN_ROLE])).exclude(pk=user.pk).exists():
            raise AdministrationError('Keep at least one active administrator.', 409)


def _set_roles(user, roles, actor):
    # Native groups are the role records. Only a superuser can remove advanced
    # group memberships; direct user permissions are never altered here.
    selected = [Group.objects.using(DB).get_or_create(name=ACCESS_GROUPS[role])[0]
                if role in ACCESS_GROUPS else _role_group(role) for role in roles]
    if any(group is None for group in selected):
        raise AdministrationError('A selected role no longer exists. Refresh and try again.', 409)
    selected_ids = {group.pk for group in selected}
    remove = [group for group in _groups(user)
              if group.pk not in selected_ids and (actor.is_superuser or not _unsafe_group_permissions(group))]
    if remove:
        user.groups.remove(*remove)
    if selected:
        user.groups.add(*selected)


def _set_direct_permissions(user, permissions):
    user.user_permissions.set(permissions)


def _sync_specialist(user, was_agent=False):
    enabled = user.is_active and AGENT_ROLE in _role_ids(user)
    if not enabled and not was_agent:
        return []
    from callcentre.access import sync_agent
    warning = sync_agent(user, enabled)
    return [warning] if warning else []


def _log(actor, user, flag, summary):
    model = user._meta
    # A transaction may roll back a newly created content type. Bypass the
    # process cache so the next request cannot reuse that rolled-back row.
    content_type, _ = ContentType.objects.using(DB).get_or_create(
        app_label=model.app_label, model=model.model_name,
    )
    LogEntry.objects.using(DB).create(
        user_id=actor.pk, content_type_id=content_type.pk, object_id=str(user.pk),
        object_repr=str(user)[:200], action_flag=flag, change_message=summary,
    )


def _change_summary(before, values, old_roles, roles, password, old_direct_permissions=None, direct_permissions=None):
    labels = [FIELD_LABELS[key] for key, field in USER_FIELDS.items() if field in values and before[field] != values[field]]
    parts = ['Changed '+', '.join(labels)+'.'] if labels else []
    added = [_role_label(role) for role in roles if role not in old_roles]
    removed = [_role_label(role) for role in old_roles if role not in roles]
    if added:
        parts.append('Added roles: '+', '.join(added)+'.')
    if removed:
        parts.append('Removed roles: '+', '.join(removed)+'.')
    if password is not None:
        parts.append('Changed password.')
    if direct_permissions is not None:
        old_codes = set(old_direct_permissions or ())
        new_codes = {_permission_code(permission) for permission in direct_permissions}
        if old_codes != new_codes:
            parts.append('Updated direct Django permissions.')
    return ' '.join(parts)


@ensure_csrf_cookie
@administrator_view(['GET'])
def session_view(request, actor):
    return JsonResponse({
        'canManageAdministration': True,
        'canManagePrivilegedAccounts': bool(actor.is_superuser),
        'currentUserId': actor.pk,
        'djangoAdminUrl': '/admin/' if actor.is_staff else None,
    })


def _role_revision(group):
    data = {
        'id': group.pk, 'name': group.name,
        'permissions': sorted(permission.pk for permission in group.permissions.all()),
        'members': _role_member_ids(group),
    }
    return salted_hmac('login.administration.role_revision', json.dumps(data, sort_keys=True), algorithm='sha256').hexdigest()


def _role_member_ids(group):
    if hasattr(group, '_administration_members'):
        return sorted(user.pk for user in group._administration_members)
    return sorted(group.user_set.values_list('pk', flat=True))


def _serialize_role(group, actor):
    key = _role_key(group)
    is_system = key in ACCESS_GROUPS
    unsafe = _unsafe_group_permissions(group)
    can_manage = bool(actor.is_superuser or (not is_system and not unsafe))
    permission_codes = {f'login.{permission.codename}' for permission in group.permissions.all()
                        if _safe_permission(permission)}
    permission_codes.update(legacy_role_permissions(group.name, include_baseline=True))
    return {
        'id': key, 'groupId': group.pk,
        'name': ROLE_DETAILS[key][0] if is_system else group.name,
        'description': ROLE_DETAILS[key][1] if is_system else 'A custom role using Django group permissions.',
        'section': ROLE_DETAILS[key][2] if is_system else 'custom',
        'groupName': group.name, 'assignedCount': len(_role_member_ids(group)),
        'permissions': sorted(permission_codes), 'isSystem': is_system,
        'djangoPermissions': sorted(_permission_code(permission) for permission in group.permissions.all()
                                    if not _safe_permission(permission)),
        'canEdit': can_manage, 'canDelete': bool(can_manage and not is_system),
        'canAssign': bool(actor.is_superuser or not unsafe),
        'revision': _role_revision(group),
        'unmanagedPermissions': [{'id': _permission_code(permission),
                                  'name': permission.name} for permission in unsafe],
    }


def _missing_system_role(key, actor):
    return {
        'id': key, 'groupId': None, 'name': ROLE_DETAILS[key][0],
        'description': ROLE_DETAILS[key][1], 'section': ROLE_DETAILS[key][2],
        'groupName': ACCESS_GROUPS[key], 'assignedCount': 0,
        'permissions': sorted(legacy_role_permissions(ACCESS_GROUPS[key], include_baseline=True)),
        'djangoPermissions': [],
        'isSystem': True, 'canEdit': False, 'canDelete': False, 'canAssign': True,
        'revision': '', 'unmanagedPermissions': [],
    }


def _validate_role_payload(payload, actor, group=None):
    allowed = {'name', 'permissions', 'djangoPermissions'} | ({'revision'} if group else set())
    if set(payload) - allowed:
        raise AdministrationError('The request contains unsupported fields.')
    if 'djangoPermissions' in payload and not actor.is_superuser:
        raise AdministrationError('Only a Django superuser can change native Django group permissions.', 403)
    errors = {}
    name = payload.get('name', group.name if group else '')
    if not isinstance(name, str) or not name.strip():
        errors['name'] = ['Enter a role name.']
        name = ''
    else:
        name = name.strip()
        try:
            Group._meta.get_field('name').clean(name, group)
        except ValidationError as error:
            errors['name'] = error.messages
        if name.casefold() in {value.casefold() for value in (*ACCESS_GROUPS.values(), LEGACY_CALL_CENTRE_GROUP)}:
            errors['name'] = ['This name is reserved for a system role.']
        elif Group.objects.using(DB).filter(name__iexact=name).exclude(pk=group.pk if group else None).exists():
            errors['name'] = ['A role with this name already exists.']
    permissions = payload.get('permissions')
    if not isinstance(permissions, list) or any(
        not isinstance(code, str) or code not in SAFE_PERMISSION_CODES for code in permissions
    ):
        errors['permissions'] = ['Select only permissions shown in this console.']
        permissions = []
    django_permissions = payload.get('djangoPermissions')
    if django_permissions is None:
        django_permissions = ([_permission_code(permission) for permission in group.permissions.all()
                               if not _safe_permission(permission)] if group else [])
    available = {_permission_code(permission): permission for permission in
                 Permission.objects.using(DB).select_related('content_type')}
    if not isinstance(django_permissions, list) or any(
        not isinstance(code, str) or code not in available or _safe_permission(available[code])
        for code in django_permissions
    ):
        errors['djangoPermissions'] = ['Select valid native Django permissions.']
        django_permissions = []
    if errors:
        raise AdministrationError('Check the highlighted fields.', errors=errors)
    return name, set(permissions), set(django_permissions)


def _set_role_permissions(group, codes, django_codes=None):
    catalog = ensure_permission_catalog(DB)
    if django_codes is None:
        native = _unsafe_group_permissions(group)
    else:
        permission_map = {_permission_code(permission): permission for permission in
                          Permission.objects.using(DB).select_related('content_type')}
        native = [permission_map[code] for code in sorted(django_codes)]
    group.permissions.set([*native, *(catalog[code] for code in sorted(codes))])


@administrator_view(['GET', 'POST'])
def roles_view(request, actor):
    if request.method == 'GET':
        groups = list(Group.objects.using(DB).prefetch_related(
            'permissions__content_type',
            Prefetch('user_set', queryset=_users().only('pk'), to_attr='_administration_members'),
        ).order_by('name', 'pk'))
        by_name = {group.name: group for group in groups}
        roles = [_serialize_role(by_name[name], actor) if name in by_name else _missing_system_role(key, actor)
                 for key, name in ACCESS_GROUPS.items()]
        roles.extend(_serialize_role(group, actor) for group in groups if group.name not in ACCESS_GROUPS.values())
        return JsonResponse({'roles': roles, 'permissionSections': permission_catalog(),
                             'djangoPermissionCatalog': _django_permission_catalog() if actor.is_superuser else []})
    payload = _body(request)
    with _mutation(request) as (actor, _):
        name, codes, django_codes = _validate_role_payload(payload, actor)
        group = Group.objects.using(DB).create(name=name)
        _set_role_permissions(group, codes, django_codes if actor.is_superuser else None)
        summary = 'Created role. Assigned application permissions: '+(', '.join(sorted(codes)) or 'none')+'.'
        if django_codes:
            summary += ' Assigned native Django permissions: '+', '.join(sorted(django_codes))+'.'
        _log(actor, group, ADDITION, summary)
        result = _serialize_role(group, actor)
    return JsonResponse({'role': result, 'warnings': []}, status=201)


@administrator_view(['GET', 'PATCH', 'DELETE'])
def role_view(request, actor, group_id):
    if request.method == 'GET':
        group = Group.objects.using(DB).filter(pk=group_id).first()
        if group is None:
            raise AdministrationError('This role no longer exists.', 404)
        return JsonResponse({'role': _serialize_role(group, actor), 'warnings': []})
    payload = _body(request)
    with _mutation(request) as (actor, _):
        group = Group.objects.using(DB).select_for_update().filter(pk=group_id).first()
        if group is None:
            raise AdministrationError('This role no longer exists.', 404)
        is_system = group.name in ACCESS_GROUPS.values()
        if request.method == 'DELETE' and is_system:
            raise AdministrationError('System groups cannot be deleted. Their names are used by the application.', 403)
        if not actor.is_superuser and (is_system or _unsafe_group_permissions(group)):
            raise AdministrationError('Only a Django superuser can change roles with advanced Django permissions.', 403)
        revision = payload.get('revision')
        if not isinstance(revision, str) or not revision or not constant_time_compare(revision, _role_revision(group)):
            raise AdministrationError('This role or its members have changed. Refresh it before saving your changes.', 409)
        if is_system:
            if set(payload) - {'revision', 'djangoPermissions'}:
                raise AdministrationError('Built-in groups keep their system name and application access; only native Django permissions can be changed.')
            codes = payload.get('djangoPermissions')
            available = {_permission_code(permission): permission for permission in
                         Permission.objects.using(DB).select_related('content_type')}
            if not isinstance(codes, list) or any(
                not isinstance(code, str) or code not in available or _safe_permission(available[code])
                for code in codes
            ):
                raise AdministrationError('Select valid native Django permissions.', errors={'djangoPermissions': ['Select valid native Django permissions.']})
            selected = list(dict.fromkeys(codes))
            old_codes = {_permission_code(permission) for permission in group.permissions.all()
                         if not _safe_permission(permission)}
            if set(selected) != old_codes:
                safe = [permission for permission in group.permissions.all() if _safe_permission(permission)]
                group.permissions.set([*safe, *(available[code] for code in selected)])
                _log(actor, group, CHANGE, 'Updated native Django permissions for the built-in group.')
            result = _serialize_role(group, actor)
            return JsonResponse({'role': result, 'warnings': []})
        if request.method == 'DELETE':
            if set(payload) - {'revision', 'confirmName'}:
                raise AdministrationError('The request contains unsupported fields.')
            if payload.get('confirmName') != group.name:
                raise AdministrationError('Type the role name exactly to confirm deletion.', errors={'confirmName': ['The role name does not match.']})
            count = group.user_set.count()
            _log(actor, group, DELETION, f'Deleted role and removed it from {count} user(s). Other roles and direct permissions were preserved.')
            group.delete(using=DB)
            return JsonResponse({'deleted': True})
        name, codes, django_codes = _validate_role_payload(payload, actor, group)
        old_name = group.name
        old_codes = {f'login.{permission.codename}' for permission in group.permissions.all() if _safe_permission(permission)}
        old_django_codes = {_permission_code(permission) for permission in group.permissions.all()
                            if not _safe_permission(permission)}
        if name != old_name or codes != old_codes or django_codes != old_django_codes:
            group.name = name
            group.save(using=DB, update_fields=['name'])
            _set_role_permissions(group, codes, django_codes if actor.is_superuser else None)
            parts = [f'Renamed role from {old_name} to {name}.'] if name != old_name else []
            if codes - old_codes:
                parts.append('Added permissions: '+', '.join(sorted(codes - old_codes))+'.')
            if old_codes - codes:
                parts.append('Removed permissions: '+', '.join(sorted(old_codes - codes))+'.')
            if django_codes != old_django_codes:
                parts.append('Updated native Django permissions.')
            _log(actor, group, CHANGE, ' '.join(parts))
        result = _serialize_role(group, actor)
    return JsonResponse({'role': result, 'warnings': []})


@sensitive_post_parameters('password')
@administrator_view(['GET', 'POST'])
def users_view(request, actor):
    if request.method == 'GET':
        page, page_size = _pagination(request)
        users = _users().order_by('username', 'pk')
        query = request.GET.get('q', '').strip()[:200]
        if query:
            users = users.annotate(_administration_full_name=Concat('first_name', Value(' '), 'last_name')).filter(
                Q(username__icontains=query) | Q(email__icontains=query)
                | Q(first_name__icontains=query) | Q(last_name__icontains=query)
                | Q(_administration_full_name__icontains=query)
            )
        role = request.GET.get('role', '')
        if role:
            group = _role_group(role)
            if role in ACCESS_GROUPS:
                users = users.filter(groups__name=ACCESS_GROUPS[role])
            elif group is not None:
                users = users.filter(groups__pk=group.pk)
            else:
                raise AdministrationError('Select an available role.')
        status = request.GET.get('status', '')
        if status and status not in ('active', 'inactive'):
            raise AdministrationError('Select active or inactive status.')
        if status:
            users = users.filter(is_active=status == 'active')
        total = users.count()
        start = (page - 1) * page_size
        users = users.prefetch_related(
            Prefetch('groups', queryset=Group.objects.using(DB).prefetch_related('permissions__content_type').order_by('name'), to_attr='_administration_groups'),
            Prefetch('user_permissions', queryset=Permission.objects.using(DB).select_related('content_type').order_by('pk'), to_attr='_administration_permissions'),
        )
        superusers = list(_users().filter(is_superuser=True, is_active=True).values_list('pk', flat=True))
        return JsonResponse({'users': [_serialize_user(user, actor, other_superusers=superusers) for user in users[start:start+page_size]], 'total': total, 'page': page, 'pageSize': page_size})
    payload = _body(request)
    with _mutation(request) as (actor, _):
        user = get_user_model()(is_active=True, is_staff=False, is_superuser=False)
        values, roles, password, direct_permissions = _validate_payload(payload, actor, user, creating=True)
        for field, value in values.items():
            setattr(user, field, value)
        user.set_password(password)
        user.save(using=DB)
        _set_roles(user, roles, actor)
        if direct_permissions is not None:
            _set_direct_permissions(user, direct_permissions)
        warnings = _sync_specialist(user)
        summary = 'Created user.'
        if roles:
            summary += ' Assigned roles: '+', '.join(_role_label(role) for role in roles)+'.'
        if direct_permissions:
            summary += ' Assigned direct Django permissions: '+', '.join(sorted(_permission_code(permission) for permission in direct_permissions))+'.'
        _log(actor, user, ADDITION, summary)
        result = _serialize_user(user, actor)
    return JsonResponse({'user': result, 'warnings': warnings}, status=201)


@sensitive_post_parameters('password')
@administrator_view(['GET', 'PATCH', 'DELETE'])
def user_view(request, actor, user_id):
    if request.method == 'GET':
        user = _users().filter(pk=user_id).first()
        if user is None:
            raise AdministrationError('This user no longer exists.', 404)
        return JsonResponse({'user': _serialize_user(user, actor)})
    payload = _body(request)
    changed_own_password = False
    with _mutation(request, user_id) as (actor, user):
        _require_edit(actor, user)
        _check_revision(user, payload)
        if request.method == 'DELETE':
            if set(payload) - {'revision', 'confirmUsername'}:
                raise AdministrationError('The request contains unsupported fields.')
            if payload.get('confirmUsername') != user.username:
                raise AdministrationError('Type the username exactly to confirm deletion.', errors={'confirmUsername': ['The username does not match.']})
            _protect_administrators(actor, user, {}, [], deleting=True)
            if LogEntry.objects.using(DB).filter(user_id=user.pk).exists():
                raise AdministrationError('This account has authored administration history. Deactivate it instead to preserve the audit trail.', 409)
            # Django's collector protects retained specialist/call records. A failed
            # deletion rolls back the log and leaves every related record intact.
            _log(actor, user, DELETION, 'Deleted user.')
            user.delete(using=DB)
            return JsonResponse({'deleted': True})
        before = {field: getattr(user, field) for field in USER_FIELDS.values()}
        old_roles = _role_ids(user)
        old_direct_permissions = {_permission_code(permission) for permission in
                                  user.user_permissions.using(DB).select_related('content_type')}
        values, roles, password, direct_permissions = _validate_payload(payload, actor, user)
        _protect_administrators(actor, user, values, roles)
        summary = _change_summary(before, values, old_roles, roles, password, old_direct_permissions, direct_permissions)
        for field, value in values.items():
            setattr(user, field, value)
        if password is not None:
            user.set_password(password)
            changed_own_password = actor.pk == user.pk
        if summary:
            user.save(using=DB)
            _set_roles(user, roles, actor)
            if direct_permissions is not None:
                _set_direct_permissions(user, direct_permissions)
            warnings = _sync_specialist(user, AGENT_ROLE in old_roles)
            _log(actor, user, CHANGE, summary)
        else:
            warnings = []
        result = _serialize_user(user, actor)
    if changed_own_password:
        update_session_auth_hash(request, user)
    return JsonResponse({'user': result, 'warnings': warnings})


@sensitive_post_parameters('password')
@administrator_view(['POST'])
def password_view(request, actor, user_id):
    payload = _body(request)
    if set(payload) - {'password', 'revision'}:
        raise AdministrationError('The request contains unsupported fields.')
    if 'password' not in payload:
        raise AdministrationError('Enter a new password.', errors={'password': ['This field is required.']})
    with _mutation(request, user_id) as (actor, user):
        _require_edit(actor, user)
        _check_revision(user, payload)
        _, _, password, _ = _validate_payload(payload, actor, user)
        user.set_password(password)
        user.save(using=DB, update_fields=['password'])
        _log(actor, user, CHANGE, 'Changed password.')
        result = _serialize_user(user, actor)
    if actor.pk == user.pk:
        update_session_auth_hash(request, user)
    return JsonResponse({'user': result, 'warnings': []})


@administrator_view(['GET'])
def history_view(request, actor):
    page, page_size = _pagination(request)
    model = get_user_model()._meta
    entries = LogEntry.objects.using(DB).filter(
        Q(content_type__app_label=model.app_label, content_type__model=model.model_name)
        | Q(content_type__app_label='auth', content_type__model='group')
    ).select_related('user', 'content_type').order_by('-action_time', '-pk')
    total = entries.count()
    start = (page - 1) * page_size
    actions = {ADDITION: 'created', CHANGE: 'updated', DELETION: 'deleted'}
    return JsonResponse({'entries': [
        {'id': entry.pk, 'createdAt': entry.action_time.isoformat(),
         'actor': entry.user.get_full_name().strip() or entry.user.username,
         'action': actions.get(entry.action_flag, 'updated'), 'objectLabel': entry.object_repr,
         'objectType': 'role' if entry.content_type.model == 'group' else 'user',
         'summary': entry.get_change_message()}
        for entry in entries[start:start+page_size]
    ], 'total': total, 'page': page, 'pageSize': page_size})
