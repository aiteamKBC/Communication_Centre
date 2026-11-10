from django.db import migrations, models


# Engagement Centre access rules that used to live only in the frontend's hard-coded card list.
AUDIENCE_BY_PATH = {
	'/dashboard/call-centre': 'call_centre',
	'/dashboard/coach-centre': 'coaches',
}

NEW_DEFAULT_CARDS = [
	{
		'title': 'Coach Engagement Centre',
		'description': 'Your learners\u2019 missed lectures: mark catch-ups done and pause their calls.',
		'label': 'Engagement Centre',
		'internal_path': '/dashboard/coach-centre',
		'icon': 'ri-user-heart-line',
		'accent_start': '#4f2d7f', 'accent_end': '#29163d', 'soft_color': '#f3eff8', 'text_color': '#4f2d7f',
		'audience': 'coaches',
	},
	{
		'title': 'initial assessment',
		'description': 'Central learning resources, reference material, and operational document access.',
		'label': 'Resource Library',
		'url': 'http://initial-assessment.kentbusinesscollege.net/',
		'icon': 'ri-book-open-line',
		'accent_start': '#f43f5e', 'accent_end': '#be123c', 'soft_color': '#fff1f7', 'text_color': '#be185d',
	},
	{
		'title': 'Lecture Intelligence',
		'description': 'Lecture records, attendance evidence, quality assurance, and positive learner moments.',
		'label': 'Lecture Operations',
		'url': 'https://positive-moments.kentbusinesscollege.net/',
		'icon': 'ri-presentation-line',
		'accent_start': '#f97316', 'accent_end': '#c2410c', 'soft_color': '#fff7ed', 'text_color': '#c2410c',
	},
]


def apply_access_rules(apps, schema_editor):
	DashboardCard = apps.get_model('dashboard_cards', 'DashboardCard')
	if not DashboardCard.objects.exists():
		# Fresh database: the API seeds every default (with its audience) on first load.
		return
	DashboardCard.objects.filter(is_admin_only=True).update(audience='admins')
	for path, audience in AUDIENCE_BY_PATH.items():
		DashboardCard.objects.filter(internal_path=path).update(audience=audience, is_admin_only=False)
	DashboardCard.objects.filter(title='Bulk Attendance', is_admin_only=True).update(audience='admins_and_call_centre')

	next_order = (DashboardCard.objects.aggregate(models.Max('sort_order'))['sort_order__max'] or 0) + 1
	for card in NEW_DEFAULT_CARDS:
		exists = DashboardCard.objects.filter(title__iexact=card['title']).exists()
		if card.get('internal_path'):
			exists = exists or DashboardCard.objects.filter(internal_path=card['internal_path']).exists()
		if card.get('url'):
			exists = exists or DashboardCard.objects.filter(url=card['url']).exists()
		if exists:
			continue
		DashboardCard.objects.create(sort_order=next_order, **card)
		next_order += 1


class Migration(migrations.Migration):

	dependencies = [
		('dashboard_cards', '0001_initial'),
	]

	operations = [
		migrations.AddField(
			model_name='dashboardcard',
			name='audience',
			field=models.CharField(choices=[('everyone', 'Everyone'), ('admins', 'Admins only'), ('admins_and_call_centre', 'Admins and call-centre staff'), ('call_centre', 'Call-centre agents and directors only'), ('coaches', 'Engagement Centre coaches only')], default='everyone', max_length=32),
		),
		migrations.RunPython(apply_access_rules, migrations.RunPython.noop),
	]
