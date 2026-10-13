from django.urls import path

from . import manage_views, views

urlpatterns = [
    path('config/', views.config),
    path('call-sync/', views.call_sync),
    path('overview/', views.overview),
    path('queue/', views.queue),
    path('tickets/<int:pk>/', views.detail),
    path('tickets/<int:pk>/booking/', views.booking),
    path('tickets/<int:pk>/booking-email/', views.booking_email),
    path('tickets/<int:pk>/booking-email/send/', views.booking_email_send),
    path('tickets/<int:pk>/satisfaction-email/', views.satisfaction_email_view),
    path('tickets/<int:pk>/tech-issue/', views.tech_issue),
    path('tickets/<int:pk>/<str:command>/', views.action),
    path('performance/', views.agent_report),
    path('call-reviews/', views.my_call_reviews),
    path('satisfaction/', views.satisfaction_report),
    path('survey/<str:token>/', views.survey),
    path('agents/', manage_views.agents),
    path('agents/<int:pk>/', manage_views.agent_detail),
    path('activity-log/', manage_views.activity_log),
    path('learners/', manage_views.learners),
    path('identity-status/', manage_views.identity_status),
    path('requests/', manage_views.call_requests),
    path('allocations/', manage_views.allocations),
    path('coach-pages/', manage_views.coach_pages),
    path('settings/', manage_views.settings_view),
]
