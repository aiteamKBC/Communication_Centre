from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('api', '0005_leadershipmessage'),
	]

	operations = [
		migrations.AddField(
			model_name='leadershipmessage',
			name='is_active',
			field=models.BooleanField(default=False),
		),
	]
