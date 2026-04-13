from django.urls import path

from .views import acknowledge_news, documents_live, events, feedback, news, training_plan

urlpatterns = [
	path('events/', events, name='events'),
	path('news/', news, name='news'),
	path('news/<int:news_id>/acknowledge/', acknowledge_news, name='acknowledge-news'),
	path('feedback/', feedback, name='feedback'),
    path('training-plan/', training_plan, name='training-plan'),
    path('documents-live/', documents_live, name='documents-live'),
]
