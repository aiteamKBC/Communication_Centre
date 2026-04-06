from django.urls import path

from .views import access_view, login_view, logout_view, microsoft_callback, microsoft_start

urlpatterns = [
    path('login/', login_view, name='auth-login'),
    path('logout/', logout_view, name='auth-logout'),
    path('access/', access_view, name='auth-access'),
    path('microsoft/start/', microsoft_start, name='auth-microsoft-start'),
    path('microsoft/callback/', microsoft_callback, name='auth-microsoft-callback'),
]
