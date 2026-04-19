from django.urls import path

from .views import acknowledge_news, documents_live, events, feedback, leadership_message, leadership_message_detail, news, training_plan, training_plan_holiday_types, training_plan_holidays, upload_image, urgent_notice, urgent_notice_detail

urlpatterns = [
	path('events/', events, name='events'),
	path('news/', news, name='news'),
	path('urgent-notice/', urgent_notice, name='urgent-notice'),
	path('urgent-notice/<int:notice_id>/', urgent_notice_detail, name='urgent-notice-detail'),
	path('leadership-message/', leadership_message, name='leadership-message'),
	path('leadership-message/<int:message_id>/', leadership_message_detail, name='leadership-message-detail'),
	path('upload-image/', upload_image, name='upload-image'),
	path('news/<int:news_id>/acknowledge/', acknowledge_news, name='acknowledge-news'),
	path('feedback/', feedback, name='feedback'),
    path('training-plan/', training_plan, name='training-plan'),
    path('training-plan-holidays/', training_plan_holidays, name='training-plan-holidays'),
    path('training-plan-holiday-types/', training_plan_holiday_types, name='training-plan-holiday-types'),
    path('documents-live/', documents_live, name='documents-live'),
]
