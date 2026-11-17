from django.urls import path

from . import administration


urlpatterns = [
    path('session/', administration.session_view, name='administration-session'),
    path('roles/', administration.roles_view, name='administration-roles'),
    path('roles/<int:group_id>/', administration.role_view, name='administration-role'),
    path('users/', administration.users_view, name='administration-users'),
    path('users/<int:user_id>/', administration.user_view, name='administration-user'),
    path('users/<int:user_id>/password/', administration.password_view, name='administration-password'),
    path('history/', administration.history_view, name='administration-history'),
]
