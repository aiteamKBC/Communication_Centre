from django.db import migrations


class Migration(migrations.Migration):

	dependencies = [
		('api', '0003_urgentnotice'),
	]

	operations = [
		migrations.RemoveField(
			model_name='urgentnotice',
			name='cta_label',
		),
		migrations.RemoveField(
			model_name='urgentnotice',
			name='cta_url',
		),
	]
