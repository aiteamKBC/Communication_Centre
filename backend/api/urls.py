from django.urls import path

from .views import acknowledge_news, documents_live, events, feedback, news, training_plan, training_plan_holidays

urlpatterns = [
	path('events/', events, name='events'),
	path('news/', news, name='news'),
	path('news/<int:news_id>/acknowledge/', acknowledge_news, name='acknowledge-news'),
	path('feedback/', feedback, name='feedback'),
    path('training-plan/', training_plan, name='training-plan'),
    path('training-plan-holidays/', training_plan_holidays, name='training-plan-holidays'),
    path('documents-live/', documents_live, name='documents-live'),
]
