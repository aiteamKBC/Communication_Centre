from django.urls import path

from .zoom_views import zoom_call_recordings, zoom_call_report, zoom_recording_audio, zoom_recording_transcript, zoom_transcript_report

urlpatterns = [
    path('calls/', zoom_call_report, name='zoom-call-report'),
    path('transcripts/', zoom_transcript_report, name='zoom-transcript-report'),
    path('calls/<int:call_pk>/recordings/', zoom_call_recordings, name='zoom-call-recordings'),
    path('recordings/<int:recording_pk>/transcript/', zoom_recording_transcript, name='zoom-recording-transcript'),
    path('recordings/<int:recording_pk>/audio/', zoom_recording_audio, name='zoom-recording-audio'),
]
