from django.contrib import admin

from .models import AuditLog, UserActivitySession, UserPageVisit


class UserPageVisitInline(admin.TabularInline):
	model = UserPageVisit
	extra = 0
	readonly_fields = ('path', 'title', 'first_seen_at', 'last_seen_at', 'duration_seconds', 'view_count')
	can_delete = False

	def has_add_permission(self, request, obj=None):
		return False


@admin.register(UserActivitySession)
class UserActivitySessionAdmin(admin.ModelAdmin):
	list_display = (
		'email',
		'username',
		'auth_provider',
		'login_at',
		'logout_at',
		'last_seen_at',
		'total_seconds',
		'page_count',
		'ip_address',
	)
	search_fields = ('email', 'username', 'display_name', 'tracking_session_id')
	list_filter = ('auth_provider', 'logout_reason', 'login_at')
	readonly_fields = (
		'tracking_session_id',
		'user_id',
		'username',
		'email',
		'display_name',
		'auth_provider',
		'login_at',
		'logout_at',
		'last_seen_at',
		'total_seconds',
		'page_count',
		'ip_address',
		'user_agent',
		'logout_reason',
		'created_at',
		'updated_at',
	)
	inlines = [UserPageVisitInline]


@admin.register(UserPageVisit)
class UserPageVisitAdmin(admin.ModelAdmin):
	list_display = ('session', 'path', 'title', 'duration_seconds', 'view_count', 'last_seen_at')
	search_fields = ('path', 'title', 'session__email', 'session__username')
	list_filter = ('first_seen_at', 'last_seen_at')
	readonly_fields = (
		'session',
		'path',
		'title',
		'first_seen_at',
		'last_seen_at',
		'duration_seconds',
		'view_count',
		'created_at',
		'updated_at',
	)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
	list_display = ('created_at', 'action', 'entity', 'object_label', 'email', 'username', 'ip_address')
	search_fields = ('entity', 'object_id', 'object_label', 'email', 'username', 'display_name', 'path')
	list_filter = ('action', 'entity', 'created_at')
	readonly_fields = (
		'action',
		'entity',
		'object_id',
		'object_label',
		'user_id',
		'username',
		'email',
		'display_name',
		'path',
		'method',
		'ip_address',
		'user_agent',
		'before',
		'after',
		'metadata',
		'created_at',
	)
