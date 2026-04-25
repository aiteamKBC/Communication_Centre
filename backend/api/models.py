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


class Module(models.Model):
	module_id = models.BigAutoField(primary_key=True, db_column='Module ID')
	module_name = models.TextField(db_column='Module_name', blank=True, default='')
	module_colour = models.TextField(db_column='Module_colour', blank=True, default='')
	number_of_sessions = models.TextField(db_column='Number of sessions', blank=True, default='')
	notes = models.TextField(db_column='Notes', blank=True, default='')
	session_name_1 = models.TextField(db_column='session_name_1', blank=True, default='')
	session_name_2 = models.TextField(db_column='session_name_2', blank=True, default='')
	session_name_3 = models.TextField(db_column='session_name_3', blank=True, default='')
	session_name_4 = models.TextField(db_column='session_name_4', blank=True, default='')
	session_name_5 = models.TextField(db_column='session_name_5', blank=True, default='')
	session_name_6 = models.TextField(db_column='session_name_6', blank=True, default='')
	session_name_7 = models.TextField(db_column='session_name_7', blank=True, default='')
	session_name_8 = models.TextField(db_column='session_name_8', blank=True, default='')
	session_name_9 = models.TextField(db_column='session_name_9', blank=True, default='')
	session_name_10 = models.TextField(db_column='session_name_10', blank=True, default='')
	session_name_11 = models.TextField(db_column='session_name_11', blank=True, default='')
	session_name_12 = models.TextField(db_column='session_name_12', blank=True, default='')
	session_name_13 = models.TextField(db_column='session_name_13', blank=True, default='')
	session_description_1 = models.TextField(db_column='session_description_1', blank=True, default='')
	session_description_2 = models.TextField(db_column='session_description_2', blank=True, default='')
	session_description_3 = models.TextField(db_column='session_description_3', blank=True, default='')
	session_description_4 = models.TextField(db_column='session_description_4', blank=True, default='')
	session_description_5 = models.TextField(db_column='session_description_5', blank=True, default='')
	session_description_6 = models.TextField(db_column='session_description_6', blank=True, default='')
	session_description_7 = models.TextField(db_column='session_description_7', blank=True, default='')
	session_description_8 = models.TextField(db_column='session_description_8', blank=True, default='')
	session_description_9 = models.TextField(db_column='session_description_9', blank=True, default='')
	session_description_10 = models.TextField(db_column='session_description_10', blank=True, default='')
	session_description_11 = models.TextField(db_column='session_description_11', blank=True, default='')
	session_description_12 = models.TextField(db_column='session_description_12', blank=True, default='')
	session_description_13 = models.TextField(db_column='session_description_13', blank=True, default='')

	class Meta:
		db_table = 'Modules'
		managed = False


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


class Employee(models.Model):
	full_name = models.TextField(db_column='Full name')
	job_title = models.TextField(db_column='Job Title', blank=True, default='')
	department = models.TextField(db_column='Department', blank=True, default='')
	reports_to = models.TextField(db_column='Reports to', blank=True, null=True, default=None)
	email = models.TextField(db_column='Email', blank=True, default='')
	phone = models.TextField(db_column='Phone', blank=True, default='')

	class Meta:
		db_table = 'Table'
		managed = False


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
