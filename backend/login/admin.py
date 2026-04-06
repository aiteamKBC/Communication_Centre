from django import forms
from django.contrib import admin
from django.contrib.admin.sites import NotRegistered
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import GroupAdmin, UserAdmin
from django.contrib.auth.models import Group

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
					'groups',
					'user_permissions',
				)
			},
		),
		('Important dates', {'fields': ('last_login', 'date_joined')}),
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
