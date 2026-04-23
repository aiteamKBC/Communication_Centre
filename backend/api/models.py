from django.db import models


class EventData(models.Model):
	event_id = models.BigAutoField(primary_key=True, db_column='Event Id')
	event_title = models.TextField(db_column='Event Title')
	event_description = models.TextField(db_column='Event Description', blank=True, default='')
	event_platform_or_meeting_link = models.TextField(db_column='Event latform / Meeting Link', blank=True, default='')
	event_date = models.TextField(db_column='Event Date')
	registration_link = models.TextField(db_column='registration link', blank=True, default='')
	event_time = models.TextField(db_column='Event time', blank=True, default='')
	event_type = models.TextField(db_column='event type', blank=True, default='online')

	class Meta:
		db_table = 'Event_data'
		managed = False


class News(models.Model):
	id = models.BigAutoField(primary_key=True, db_column='ID')
	title = models.TextField(db_column='Title')
	details = models.TextField(db_column='Details', blank=True, default='')
	image_url = models.TextField(db_column='Image url', blank=True, default='')
	publication_date = models.DateField(db_column='publication_date', null=True, blank=True)
	audience = models.CharField(db_column='audience', max_length=100, blank=True, default='All Staff')
	category = models.CharField(db_column='category', max_length=100, blank=True, default='General')
	priority = models.CharField(db_column='priority', max_length=50, blank=True, default='general')
	summary = models.TextField(db_column='summary', blank=True, default='')
	full_article_content = models.TextField(db_column='full_article_content', blank=True, default='')
	status = models.CharField(db_column='status', max_length=50, blank=True, default='pending_review')
	acknowledged = models.BooleanField(db_column='acknowledged', default=False)
	created_at = models.DateTimeField(db_column='created_at', null=True, blank=True)
	updated_at = models.DateTimeField(db_column='updated_at', null=True, blank=True)

	class Meta:
		db_table = 'News'
		managed = False


class TrainingPlan(models.Model):
	id = models.BigAutoField(primary_key=True)
	cohort_name = models.TextField(db_column='Cohort_name', blank=True, default='')
	program = models.TextField(db_column='Program', blank=True, default='')
	starting_date_lable = models.TextField(db_column='Starting_date_lable', blank=True, default='')
	module_name = models.TextField(blank=True, default='')
	group_name = models.TextField(blank=True, default='')
	coach_name = models.TextField(blank=True, default='')
	tutor_name = models.TextField(db_column='Tutor_name', blank=True, default='')
	start_date = models.TextField(blank=True, default='')
	end_date = models.TextField(blank=True, default='')
	sessions_number = models.TextField(blank=True, default='')
	session_week_day = models.TextField(blank=True, default='')
	session_start_time = models.TextField(blank=True, default='')
	session_end_time = models.TextField(blank=True, default='')
	notes = models.TextField(blank=True, default='')

	class Meta:
		db_table = 'Training_plan'
		managed = False


class TrainingPlanHoliday(models.Model):
	id = models.BigAutoField(primary_key=True)
	label = models.TextField(blank=True, default='')
	start_date = models.DateField()
	end_date = models.DateField()
	type = models.CharField(max_length=50, blank=True, default='holiday')
	color = models.CharField(max_length=32, blank=True, default='#FFFBEB')
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		db_table = 'training_plan_holidays'


class TrainingPlanModuleDefinition(models.Model):
	id = models.BigAutoField(primary_key=True)
	module_id = models.CharField(max_length=150, unique=True)
	name = models.CharField(max_length=255)
	default_sessions = models.PositiveIntegerField(default=1)
	bg = models.CharField(max_length=32, default='#4A6DB0')
	tx = models.CharField(max_length=32, default='#ffffff')
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		db_table = 'training_plan_module_definitions'


class TrainingPlanProgramConfig(models.Model):
	id = models.BigAutoField(primary_key=True)
	program_id = models.CharField(max_length=150, unique=True)
	name = models.CharField(max_length=255)
	sub = models.TextField(blank=True, default='')
	color = models.CharField(max_length=32, default='#1B2A4A')
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		db_table = 'training_plan_program_configs'


class UrgentNotice(models.Model):
	id = models.BigAutoField(primary_key=True)
	title = models.TextField(blank=True, default='')
	body = models.TextField(blank=True, default='')
	is_active = models.BooleanField(default=False)
	publication_date = models.DateField(null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		db_table = 'urgent_notices'


class LeadershipMessage(models.Model):
	id = models.BigAutoField(primary_key=True)
	card_title = models.TextField(blank=True, default='')
	card_teaser = models.TextField(blank=True, default='')
	author_name = models.CharField(max_length=150, blank=True, default='')
	author_role = models.CharField(max_length=200, blank=True, default='')
	is_active = models.BooleanField(default=False)
	publication_date = models.DateField(null=True, blank=True)
	body = models.TextField(blank=True, default='')
	cover_image_url = models.TextField(blank=True, default='')
	profile_image_url = models.TextField(blank=True, default='')
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		db_table = 'leadership_messages'


class Feedback(models.Model):
	id = models.BigAutoField(primary_key=True, db_column='Feedback ID')
	username = models.TextField(db_column='Username', blank=True, default='')
	email = models.TextField(db_column='Email', blank=True, default='')
	category = models.TextField(db_column='Feedback category', blank=True, default='General Feedback')
	department = models.TextField(db_column='Department', blank=True, default='')
	priority = models.TextField(db_column='Priority', blank=True, default='normal')
	anonymous = models.BooleanField(db_column='Anonymous', default=False)
	details = models.TextField(db_column='Feedback details', blank=True, default='')
	submitted_at = models.DateTimeField(db_column='Submitted_at', null=True, blank=True)

	class Meta:
		db_table = 'Feedback'
		managed = False
