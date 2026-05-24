from django import forms
from django.contrib import admin
from django.contrib.admin.options import IS_POPUP_VAR
from django.contrib.admin.sites import NotRegistered
from django.contrib.admin.utils import unquote
from django.contrib.auth import get_user_model, update_session_auth_hash
from django.contrib.auth.admin import GroupAdmin, UserAdmin
from django.contrib.auth.models import Group
from django.core.exceptions import PermissionDenied
from django.http import Http404, HttpResponseRedirect
from django.contrib import messages as admin_messages
from django.template.response import TemplateResponse
from django.urls import reverse
from django.utils.decorators import method_decorator
from django.utils.html import escape
from django.utils.translation import gettext
from django.views.decorators.debug import sensitive_post_parameters

from .access import ACCESS_GROUPS, ensure_access_groups


class LoginDBAdminMixin:
	"""Route auth admin read/write operations to the login user database."""

	using = 'login_db'

	def get_queryset(self, request):
		return super().get_queryset(request).using(self.using)

	def save_model(self, request, obj, form, change):
		obj.save(using=self.using)

	def delete_model(self, request, obj):
		obj.delete(using=self.using)

	def formfield_for_foreignkey(self, db_field, request, **kwargs):
		return super().formfield_for_foreignkey(db_field, request, using=self.using, **kwargs)

	def formfield_for_manytomany(self, db_field, request, **kwargs):
		return super().formfield_for_manytomany(db_field, request, using=self.using, **kwargs)


class AccessCheckboxForm(forms.ModelForm):
	access_admin = forms.BooleanField(required=False, label='Admin access')
	access_event_manager = forms.BooleanField(required=False, label='Event manager access')
	access_operations = forms.BooleanField(required=False, label='Operations access')
	access_it = forms.BooleanField(required=False, label='IT access')
	access_marketing = forms.BooleanField(required=False, label='Marketing access')
	access_support = forms.BooleanField(required=False, label='Support access')

	class Meta:
		model = get_user_model()
		fields = '__all__'

	def __init__(self, *args, **kwargs):
		super().__init__(*args, **kwargs)
		ensure_access_groups('login_db')

		user = self.instance
		if not user or not user.pk:
			return

		group_names = set(user.groups.using('login_db').values_list('name', flat=True))
		for field_name, group_name in ACCESS_GROUPS.items():
			if field_name in self.fields:
				self.fields[field_name].initial = group_name in group_names


User = get_user_model()

try:
	admin.site.unregister(User)
except NotRegistered:
	pass

try:
	admin.site.unregister(Group)
except NotRegistered:
	pass


@admin.register(User)
class LoginDBUserAdmin(LoginDBAdminMixin, UserAdmin):
	form = AccessCheckboxForm
	fieldsets = (
		(None, {'fields': ('username', 'password')}),
		('Personal info', {'fields': ('first_name', 'last_name', 'email')}),
		(
			'Permissions',
			{
				'fields': (
					'is_active',
					'is_staff',
					'is_superuser',
					'access_admin',
					'access_event_manager',
					'access_operations',
					'access_it',
					'access_marketing',
					'access_support',
					'groups',
					'user_permissions',
				)
			},
		),
		('Important dates', {'fields': ('last_login', 'date_joined')}),
	)

	@method_decorator(sensitive_post_parameters())
	def user_change_password(self, request, id, form_url=''):
		user = self.get_object(request, unquote(id))
		if not self.has_change_permission(request, user):
			raise PermissionDenied
		if user is None:
			raise Http404(
				'%(name)s object with primary key %(key)r does not exist.'
				% {'name': self.opts.verbose_name, 'key': escape(id)}
			)
		if request.method == 'POST':
			form = self.change_password_form(user, request.POST)
			if form.is_valid():
				valid_submission = (
					form.cleaned_data['set_usable_password']
					or 'unset-password' in request.POST
				)
				if not valid_submission:
					admin_messages.error(request, gettext('Conflicting form data submitted. Please try again.'))
					return HttpResponseRedirect(request.get_full_path())
				user = form.save(commit=False)
				user.save(using=self.using)
				change_message = self.construct_change_message(request, form, None)
				self.log_change(request, user, change_message)
				if user.has_usable_password():
					msg = gettext('Password changed successfully.')
				else:
					msg = gettext('Password-based authentication was disabled.')
				admin_messages.success(request, msg)
				update_session_auth_hash(request, form.user)
				return HttpResponseRedirect(
					reverse(
						'%s:%s_%s_change' % (
							self.admin_site.name,
							user._meta.app_label,
							user._meta.model_name,
						),
						args=(user.pk,),
					)
				)
		else:
			form = self.change_password_form(user)

		fieldsets = [(None, {'fields': list(form.base_fields)})]
		admin_form = admin.helpers.AdminForm(form, fieldsets, {})

		if user.has_usable_password():
			title = gettext('Change password: %s')
		else:
			title = gettext('Set password: %s')
		context = {
			'title': title % escape(user.get_username()),
			'adminForm': admin_form,
			'form_url': form_url,
			'form': form,
			'is_popup': (IS_POPUP_VAR in request.POST or IS_POPUP_VAR in request.GET),
			'is_popup_var': IS_POPUP_VAR,
			'add': True,
			'change': False,
			'has_delete_permission': False,
			'has_change_permission': True,
			'has_absolute_url': False,
			'opts': self.opts,
			'original': user,
			'save_as': False,
			'show_save': True,
			**self.admin_site.each_context(request),
		}
		request.current_app = self.admin_site.name
		return TemplateResponse(
			request,
			self.change_user_password_template or 'admin/auth/user/change_password.html',
			context,
		)

	def save_related(self, request, form, formsets, change):
		super().save_related(request, form, formsets, change)

		ensure_access_groups(self.using)
		user = form.instance
		selected_group_names = {
			group_name
			for field_name, group_name in ACCESS_GROUPS.items()
			if form.cleaned_data.get(field_name)
		}

		access_groups_qs = Group.objects.using(self.using).filter(name__in=ACCESS_GROUPS.values())
		selected_access_group_ids = set(
			access_groups_qs.filter(name__in=selected_group_names).values_list('id', flat=True)
		)
		all_current_group_ids = set(user.groups.using(self.using).values_list('id', flat=True))
		access_group_ids = set(access_groups_qs.values_list('id', flat=True))
		non_access_group_ids = all_current_group_ids - access_group_ids
		final_group_ids = sorted(non_access_group_ids.union(selected_access_group_ids))

		final_groups = list(Group.objects.using(self.using).filter(id__in=final_group_ids))
		user.groups.set(final_groups)


@admin.register(Group)
class LoginDBGroupAdmin(LoginDBAdminMixin, GroupAdmin):
	pass
