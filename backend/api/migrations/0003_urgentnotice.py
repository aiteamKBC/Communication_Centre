from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('api', '0002_trainingplanholiday'),
	]

	operations = [
		migrations.CreateModel(
			name='UrgentNotice',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('title', models.TextField(blank=True, default='')),
				('body', models.TextField(blank=True, default='')),
				('publication_date', models.DateField(blank=True, null=True)),
				('cta_label', models.CharField(blank=True, default='Add Notice', max_length=100)),
				('cta_url', models.TextField(blank=True, default='/urgent-notice/new')),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
			],
			options={
				'db_table': 'urgent_notices',
			},
		),
	]
