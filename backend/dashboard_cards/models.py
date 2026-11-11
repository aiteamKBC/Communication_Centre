from django.db import models


class DashboardCard(models.Model):
	STATUS_AVAILABLE = 'available'
	STATUS_UNAVAILABLE = 'unavailable'
	STATUS_MAINTENANCE = 'maintenance'
	STATUS_HIDDEN = 'hidden'
	STATUS_CHOICES = (
		(STATUS_AVAILABLE, 'Available'),
		(STATUS_UNAVAILABLE, 'Unavailable'),
		(STATUS_MAINTENANCE, 'Under maintenance'),
		(STATUS_HIDDEN, 'Hidden'),
	)

	title = models.CharField(max_length=255)
	description = models.TextField(blank=True, default='')
	label = models.CharField(max_length=120, blank=True, default='')
	url = models.URLField(blank=True, default='')
	internal_path = models.CharField(max_length=255, blank=True, default='')
	icon = models.CharField(max_length=120, default='ri-dashboard-line')
	accent_start = models.CharField(max_length=32, default='#1B2A4A')
	accent_end = models.CharField(max_length=32, default='#2E4482')
	soft_color = models.CharField(max_length=32, default='#eef2ff')
	text_color = models.CharField(max_length=32, default='#2E4482')
	status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_AVAILABLE)
	# Who can see the card. 'admins_and_call_centre', 'call_centre' and 'coaches' carry the Engagement Centre
	# access rules (call-centre agents/directors and Engagement Centre coaches) from login.access.
	AUDIENCE_EVERYONE = 'everyone'
	AUDIENCE_ADMINS = 'admins'
	AUDIENCE_ADMINS_AND_CALL_CENTRE = 'admins_and_call_centre'
	AUDIENCE_CALL_CENTRE = 'call_centre'
	AUDIENCE_COACHES = 'coaches'
	AUDIENCE_CHOICES = (
		(AUDIENCE_EVERYONE, 'Everyone'),
		(AUDIENCE_ADMINS, 'Admins only'),
		(AUDIENCE_ADMINS_AND_CALL_CENTRE, 'Admins and call-centre staff'),
		(AUDIENCE_CALL_CENTRE, 'Call-centre agents and directors only'),
		(AUDIENCE_COACHES, 'Engagement Centre coaches only'),
	)

	is_admin_only = models.BooleanField(default=False)
	audience = models.CharField(max_length=32, choices=AUDIENCE_CHOICES, default=AUDIENCE_EVERYONE)
	sort_order = models.PositiveIntegerField(default=0)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		db_table = 'dashboard_cards'
		ordering = ('sort_order', 'id')
