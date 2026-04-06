from django.urls import path

from .views import documents_live, events, news, training_plan

urlpatterns = [
    path('events/', events, name='events'),
    path('news/', news, name='news'),
    path('training-plan/', training_plan, name='training-plan'),
    path('documents-live/', documents_live, name='documents-live'),
]
