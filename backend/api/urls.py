from django.urls import path

from .views import audit_logs, documents_live, employee_detail, employees, event_detail, events, feedback, ksb_profile_detail, ksb_profiles, leadership_message, leadership_message_detail, module_detail, modules, news, news_detail, realtime, risk_register, training_plan, training_plan_holiday_types, training_plan_holidays, training_plan_modules, training_plan_program_configs, upload_image, urgent_notice, urgent_notice_detail, urgent_tickets, user_activity

urlpatterns = [
    path('employees/', employees, name='employees'),
    path('realtime/', realtime, name='realtime'),
    path('employees/<int:employee_id>/', employee_detail, name='employee-detail'),
	path('events/', events, name='events'),
	path('events/<int:event_id>/', event_detail, name='event-detail'),
	path('news/', news, name='news'),
	path('news/<int:news_id>/', news_detail, name='news-detail'),
	path('urgent-notice/', urgent_notice, name='urgent-notice'),
	path('urgent-notice/<int:notice_id>/', urgent_notice_detail, name='urgent-notice-detail'),
	path('leadership-message/', leadership_message, name='leadership-message'),
	path('leadership-message/<int:message_id>/', leadership_message_detail, name='leadership-message-detail'),
	path('upload-image/', upload_image, name='upload-image'),
	path('feedback/', feedback, name='feedback'),
    path('training-plan/', training_plan, name='training-plan'),
    path('training-plan-holidays/', training_plan_holidays, name='training-plan-holidays'),
    path('training-plan-holiday-types/', training_plan_holiday_types, name='training-plan-holiday-types'),
    path('training-plan-modules/', training_plan_modules, name='training-plan-modules'),
    path('training-plan-program-configs/', training_plan_program_configs, name='training-plan-program-configs'),
    path('ksb-profiles/', ksb_profiles, name='ksb-profiles'),
    path('ksb-profiles/<int:profile_id>/', ksb_profile_detail, name='ksb-profile-detail'),
    path('documents-live/', documents_live, name='documents-live'),
    path('modules/', modules, name='modules'),
    path('modules/<int:module_id>/', module_detail, name='module-detail'),
    path('urgent-tickets/', urgent_tickets, name='urgent-tickets'),
    path('risk-register/', risk_register, name='risk-register'),
    path('user-activity/', user_activity, name='user-activity'),
    path('audit-logs/', audit_logs, name='audit-logs'),
]
