from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('api', '0022_training_plan_archive_fields'),
	]

	operations = [
		migrations.CreateModel(
			name='CoachProfile',
			fields=[
				('id', models.BigAutoField(primary_key=True, serialize=False)),
				('name', models.CharField(max_length=255)),
				('normalized_name', models.CharField(max_length=255, unique=True)),
				('email', models.EmailField(blank=True, default='', max_length=254)),
				('phone', models.CharField(blank=True, default='', max_length=80)),
				('notes', models.TextField(blank=True, default='')),
				('availability_notes', models.TextField(blank=True, default='')),
				('is_active', models.BooleanField(default=True)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
			],
			options={
				'db_table': 'coach_profiles',
				'indexes': [
					models.Index(fields=['is_active', 'name'], name='coach_profi_is_acti_58a4f2_idx'),
					models.Index(fields=['normalized_name'], name='coach_profi_normali_7e2d41_idx'),
				],
			},
		),
	]
