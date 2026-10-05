"""Call-centre and Zoom Phone models.

These map the existing tables in the shared login database (created by the legacy
superAdminDashboard migrations). Every model is ``managed = False``: Django never
creates or alters them. Routed to ``login_db`` by ``backend.db_routers.CallCentreRouter``.
"""

import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.db.models.functions import Lower

from .rules import out_of_scope


class ZoomPhoneCall(models.Model):
    source_account = models.CharField(max_length=16, db_index=True)
    zoom_account_id = models.CharField(max_length=128)
    history_id = models.CharField(max_length=255)
    call_id = models.CharField(max_length=255, blank=True)
    direction = models.CharField(max_length=16)
    caller_number = models.CharField(max_length=128, blank=True)
    caller_name = models.CharField(max_length=255, blank=True)
    caller_user_id = models.CharField(max_length=128, blank=True)
    caller_email = models.CharField(max_length=255, blank=True)
    callee_number = models.CharField(max_length=128, blank=True)
    callee_name = models.CharField(max_length=255, blank=True)
    started_at = models.DateTimeField()
    answered_at = models.DateTimeField(null=True)
    ended_at = models.DateTimeField(null=True)
    duration_seconds = models.PositiveIntegerField(null=True)
    raw_result = models.CharField(max_length=128, blank=True)
    result = models.CharField(max_length=32)
    synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dashboard_zoom_phone_call'
        managed = False
        constraints = [models.UniqueConstraint(
            fields=['zoom_account_id', 'history_id'], name='zoom_account_history_unique',
        )]
        indexes = [models.Index(fields=['source_account', 'started_at'], name='zoom_source_started_idx')]
        ordering = ['-started_at', '-id']


class ZoomSyncState(models.Model):
    source_account = models.CharField(max_length=16, primary_key=True)
    zoom_account_id = models.CharField(max_length=128)
    last_success_at = models.DateTimeField(null=True)
    covered_through = models.DateField(null=True)
    last_error = models.CharField(max_length=255, blank=True)
    locked_until = models.DateTimeField(null=True)
    lock_token = models.CharField(max_length=36, blank=True)
    recordings_covered_through = models.DateField(null=True)
    recordings_last_success_at = models.DateTimeField(null=True)
    recordings_error = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = 'dashboard_zoom_sync_state'
        managed = False


class ZoomPhoneRecording(models.Model):
    source_account = models.CharField(max_length=16, db_index=True)
    zoom_account_id = models.CharField(max_length=128)
    recording_id = models.CharField(max_length=255)
    call_id = models.CharField(max_length=255, blank=True, db_index=True)
    call_log_id = models.CharField(max_length=255, blank=True)
    call_element_id = models.CharField(max_length=255, blank=True)
    direction = models.CharField(max_length=16, blank=True)
    caller_number = models.CharField(max_length=128, blank=True)
    caller_name = models.CharField(max_length=255, blank=True)
    callee_number = models.CharField(max_length=128, blank=True)
    callee_name = models.CharField(max_length=255, blank=True)
    owner_id = models.CharField(max_length=128, blank=True)
    owner_name = models.CharField(max_length=255, blank=True)
    recording_type = models.CharField(max_length=32, blank=True)
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True)
    duration_seconds = models.PositiveIntegerField(null=True)
    transcript_status = models.CharField(max_length=16, default='pending')
    transcript_text = models.TextField(blank=True)
    transcript_data = models.JSONField(default=dict, blank=True)
    transcript_error = models.CharField(max_length=255, blank=True)
    transcript_checked_at = models.DateTimeField(null=True)
    transcript_next_retry_at = models.DateTimeField(null=True, db_index=True)
    synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dashboard_zoom_phone_recording'
        managed = False
        constraints = [models.UniqueConstraint(
            fields=['zoom_account_id', 'recording_id'], name='zoom_account_recording_unique',
        )]
        indexes = [models.Index(fields=['source_account', 'started_at'], name='zoom_recording_started_idx')]
        ordering = ['-started_at', '-id']


class RetainedQuerySet(models.QuerySet):
    def delete(self):
        raise ValidationError('Call Centre records are retained. Archive instead.')


class Retained(models.Model):
    objects = RetainedQuerySet.as_manager()

    class Meta:
        abstract = True

    def delete(self, *args, **kwargs):
        raise ValidationError('Call Centre records are retained. Archive instead.')


class Agent(Retained):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    display_name = models.CharField(max_length=120)
    zoom_email = models.EmailField()
    zoom_user_id = models.CharField(max_length=128, blank=True)
    zoom_phone_number = models.CharField(max_length=16, blank=True, validators=[
        RegexValidator(r'^\+[1-9][0-9]{6,14}$', 'Use the assigned Zoom number in E.164 format.'),
    ])
    zoom_account = models.CharField(max_length=16, choices=[('student', 'Student'), ('office', 'Accountant')])
    daily_talk_target_minutes = models.PositiveIntegerField(default=180)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = 'callcenter_agent'
        managed = False
        constraints = [
            models.UniqueConstraint(Lower('zoom_email'), 'zoom_account', name='cc_agent_email_account'),
            models.UniqueConstraint(fields=['zoom_user_id', 'zoom_account'], condition=~models.Q(zoom_user_id=''),
                                    name='cc_agent_user_account'),
        ]

    def save(self, *args, **kwargs):
        self.zoom_email = self.zoom_email.strip().lower()
        self.zoom_user_id = self.zoom_user_id.strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.display_name


class CaseQuerySet(RetainedQuerySet):
    def open(self):
        """Cases being worked: not archived, not resolved, and not paused or before a cutoff."""
        return self.filter(archived=False).exclude(status='resolved').exclude(out_of_scope())


class CaseTicket(Retained):
    objects = CaseQuerySet.as_manager()
    CATEGORIES = [(s, s.upper() if s in ('pr', 'mcm', 'otj', 'epa') else s.replace('_', ' ').title())
                  for s in ('attendance', 'pr', 'mcm', 'pr_missed', 'mcm_missed', 'signature', 'otj', 'epa', 'reminder',
                            'satisfaction', 'learner_satisfaction', 'manual')]
    STATES = [(s, s.replace('_', ' ').title()) for s in (
        'new', 'in_progress', 'pending_learner', 'pending_verification', 'ai_suggested_close',
        'resolved', 'unreachable', 'escalated',
    )]
    source_type = models.CharField(max_length=20, choices=CATEGORIES, db_index=True)
    source_id = models.BigIntegerField(null=True, blank=True)
    reason_key = models.CharField(max_length=500, unique=True)
    learner_email = models.EmailField(db_index=True)
    learner_name = models.CharField(max_length=255)
    learner_phone = models.CharField(max_length=32, blank=True, db_index=True)
    coach = models.CharField(max_length=255, blank=True)
    organisation = models.CharField(max_length=255, blank=True)
    programme = models.CharField(max_length=255, blank=True)
    manager_name = models.CharField(max_length=255, blank=True)
    manager_email = models.EmailField(blank=True)
    source_data = models.JSONField(default=dict)
    risk = models.CharField(max_length=10, default='amber')
    overdue_since = models.DateField(null=True, blank=True)
    misses = models.PositiveIntegerField(default=0)
    booking_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=30, choices=STATES, default='new', db_index=True)
    claimed_by = models.ForeignKey(Agent, null=True, blank=True, on_delete=models.PROTECT, related_name='claims')
    claimed_at = models.DateTimeField(null=True, blank=True)
    last_activity_at = models.DateTimeField(null=True, blank=True)
    last_actor = models.CharField(max_length=255, default='System')
    last_action_at = models.DateTimeField(auto_now_add=True)
    attempts = models.PositiveIntegerField(default=0)
    last_contact_at = models.DateTimeField(null=True, blank=True)
    next_followup_at = models.DateTimeField(null=True, blank=True, db_index=True)
    promised_at = models.DateTimeField(null=True, blank=True)
    evidence_after = models.DateTimeField(null=True, blank=True)
    resolution_option = models.CharField(max_length=40, blank=True)
    resolved_by = models.CharField(max_length=16, blank=True)
    resolved_agent = models.ForeignKey(Agent, null=True, blank=True, on_delete=models.PROTECT, related_name='resolutions')
    resolved_at = models.DateTimeField(null=True, blank=True)
    due_at = models.DateTimeField(db_index=True)
    sla_breached = models.BooleanField(default=False)
    escalated = models.BooleanField(default=False)
    ai_summary = models.TextField(blank=True)
    ai_confidence = models.FloatField(null=True, blank=True)
    archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'callcenter_case'
        managed = False
        constraints = [models.UniqueConstraint(fields=['source_type', 'source_id'],
                       condition=models.Q(source_id__isnull=False), name='cc_source_ticket_unique')]
        indexes = [models.Index(fields=['status', 'due_at'], name='cc_status_due')]


class EventQuerySet(RetainedQuerySet):
    def update(self, **kwargs):
        raise ValidationError('Events are append-only.')

    def bulk_update(self, *args, **kwargs):
        raise ValidationError('Events are append-only.')


class TicketEvent(Retained):
    ticket = models.ForeignKey(CaseTicket, on_delete=models.PROTECT, related_name='events')
    kind = models.CharField(max_length=40, db_index=True)
    actor = models.CharField(max_length=255, default='System')
    agent = models.ForeignKey(Agent, null=True, blank=True, on_delete=models.PROTECT)
    call = models.ForeignKey(ZoomPhoneCall, null=True, blank=True, on_delete=models.PROTECT)
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    objects = EventQuerySet.as_manager()

    class Meta:
        db_table = 'callcenter_event'
        managed = False
        ordering = ['created_at', 'id']

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError('Events are append-only.')
        super().save(*args, **kwargs)


class CallIntent(Retained):
    agent = models.ForeignKey(Agent, on_delete=models.PROTECT)
    tickets = models.ManyToManyField(CaseTicket, related_name='intents', db_table='callcenter_call_intent_tickets')
    learner_email = models.EmailField(db_index=True)
    number = models.CharField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)
    matched_call = models.OneToOneField(ZoomPhoneCall, null=True, blank=True, on_delete=models.PROTECT)

    class Meta:
        db_table = 'callcenter_call_intent'
        managed = False


class CallMatch(Retained):
    call = models.OneToOneField(ZoomPhoneCall, on_delete=models.PROTECT)
    agent = models.ForeignKey(Agent, on_delete=models.PROTECT)
    learner_email = models.EmailField(db_index=True)
    manual = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'callcenter_call_match'
        managed = False


class CaseCall(Retained):
    ticket = models.ForeignKey(CaseTicket, on_delete=models.PROTECT, related_name='calls')
    match = models.ForeignKey(CallMatch, on_delete=models.PROTECT, related_name='cases')
    processed_result = models.CharField(max_length=32, blank=True)
    outcome = models.CharField(max_length=30, blank=True)
    outcome_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'callcenter_case_call'
        managed = False
        constraints = [models.UniqueConstraint(fields=['ticket', 'match'], name='cc_case_call_unique')]


class AIAnalysis(Retained):
    recording = models.ForeignKey(ZoomPhoneRecording, on_delete=models.PROTECT)
    transcript_hash = models.CharField(max_length=64)
    model = models.CharField(max_length=128)
    result = models.JSONField(default=dict)
    state = models.CharField(max_length=20, default='pending')
    error = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'callcenter_ai_analysis'
        managed = False
        constraints = [models.UniqueConstraint(fields=['recording', 'transcript_hash'], name='cc_ai_version_unique')]


class EmailDelivery(Retained):
    ticket = models.ForeignKey(CaseTicket, on_delete=models.PROTECT, related_name='emails')
    dedupe_key = models.CharField(max_length=200, unique=True)
    recipient = models.EmailField()
    kind = models.CharField(max_length=32)
    mode = models.CharField(max_length=10)
    status = models.CharField(max_length=20, default='pending')
    subject = models.CharField(max_length=255)
    html = models.TextField()
    text = models.TextField()
    cc = models.EmailField(blank=True)
    error = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'callcenter_email'
        managed = False


class EmailQuota(models.Model):
    recipient = models.EmailField()
    day = models.DateField()
    count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'callcenter_email_quota'
        managed = False
        constraints = [models.UniqueConstraint(fields=['recipient', 'day'], name='cc_email_daily_quota')]


class EmployerSatisfaction(Retained):
    ticket = models.OneToOneField(CaseTicket, on_delete=models.PROTECT, related_name='survey')
    manager_email = models.EmailField()
    organisation = models.CharField(max_length=255, blank=True)
    quarter = models.CharField(max_length=7)
    nonce = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    issued_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    score = models.PositiveSmallIntegerField(null=True, blank=True)
    comment = models.TextField(blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'callcenter_satisfaction'
        managed = False
        constraints = [
            models.UniqueConstraint(fields=['manager_email', 'quarter'], name='cc_survey_quarter_unique'),
            models.CheckConstraint(condition=models.Q(score__isnull=True) | models.Q(score__gte=1, score__lte=5),
                                   name='cc_survey_score_range'),
        ]


class CycleState(models.Model):
    name = models.CharField(max_length=60, primary_key=True)
    locked_until = models.DateTimeField(null=True)
    token = models.CharField(max_length=36, blank=True)
    last_success_at = models.DateTimeField(null=True)
    details = models.JSONField(default=dict)

    class Meta:
        db_table = 'callcenter_cycle_state'
        managed = False


class Allocation(models.Model):
    """The engagement specialist who looks after a learner; no row (or no agent) means the shared queue."""
    learner_email = models.EmailField(max_length=254, primary_key=True)
    agent = models.ForeignKey(Agent, null=True, blank=True, on_delete=models.PROTECT, related_name='allocations')
    revision = models.PositiveIntegerField(default=1)
    updated_by = models.CharField(max_length=255)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'callcenter_allocation'
        managed = False


class AllocationHistory(Retained):
    learner_email = models.EmailField(db_index=True)
    previous_agent = models.ForeignKey(Agent, null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    agent = models.ForeignKey(Agent, null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    reason = models.TextField()
    actor = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'callcenter_allocation_history'
        managed = False


class Setting(models.Model):
    """A director-managed setting group (e.g. 'email'); the value overrides the .env defaults."""
    key = models.CharField(max_length=64, primary_key=True)
    value = models.JSONField()
    revision = models.PositiveIntegerField(default=1)
    updated_by = models.CharField(max_length=255)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'callcenter_setting'
        managed = False


class SettingHistory(Retained):
    key = models.CharField(max_length=64)
    previous = models.JSONField(null=True)
    value = models.JSONField()
    reason = models.TextField()
    actor = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'callcenter_setting_history'
        managed = False
