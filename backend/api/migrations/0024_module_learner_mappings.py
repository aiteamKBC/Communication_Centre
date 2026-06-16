from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('api', '0023_coach_profiles'),
	]

	operations = [
		migrations.CreateModel(
			name='ModuleLearnerMapping',
			fields=[
				('id', models.BigAutoField(primary_key=True, serialize=False)),
				('module_catalogue_id', models.CharField(max_length=150)),
				('subprogramme', models.TextField()),
				('learner_identity', models.CharField(max_length=320)),
				('learner_id', models.CharField(blank=True, default='', max_length=150)),
				('learner_name', models.TextField(blank=True, default='')),
				('learner_email', models.TextField(blank=True, default='')),
				('selected_state', models.BooleanField(default=True)),
				('sort_order', models.IntegerField(default=0)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
			],
			options={
				'db_table': 'module_learner_mappings',
				'indexes': [
					models.Index(fields=['module_catalogue_id', 'subprogramme'], name='module_lear_module__f55f8b_idx'),
					models.Index(fields=['module_catalogue_id', 'learner_identity'], name='module_lear_module__f3f64d_idx'),
				],
				'unique_together': {('module_catalogue_id', 'subprogramme', 'learner_identity')},
			},
		),
	]
