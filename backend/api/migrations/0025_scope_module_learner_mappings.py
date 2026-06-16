from django.db import migrations, models


def scope_existing_catalogue_mappings(apps, schema_editor):
	ModuleLearnerMapping = apps.get_model('api', 'ModuleLearnerMapping')
	for item in ModuleLearnerMapping.objects.all().iterator():
		legacy_scope = f'catalogue:{item.module_catalogue_id}'
		item.cohort_id = legacy_scope
		item.module_block_id = legacy_scope
		item.save(update_fields=['cohort_id', 'module_block_id'])


class Migration(migrations.Migration):

	dependencies = [
		('api', '0024_module_learner_mappings'),
	]

	operations = [
		migrations.AlterUniqueTogether(
			name='modulelearnermapping',
			unique_together=set(),
		),
		migrations.AddField(
			model_name='modulelearnermapping',
			name='cohort_id',
			field=models.CharField(blank=True, default='', max_length=150),
		),
		migrations.AddField(
			model_name='modulelearnermapping',
			name='module_block_id',
			field=models.CharField(blank=True, default='', max_length=150),
		),
		migrations.RunPython(scope_existing_catalogue_mappings, migrations.RunPython.noop),
		migrations.AddIndex(
			model_name='modulelearnermapping',
			index=models.Index(fields=['cohort_id', 'module_block_id', 'subprogramme'], name='module_lear_scope_s_1d2b8c_idx'),
		),
		migrations.AddIndex(
			model_name='modulelearnermapping',
			index=models.Index(fields=['cohort_id', 'module_block_id', 'learner_identity'], name='module_lear_scope_l_72d8b9_idx'),
		),
		migrations.AlterUniqueTogether(
			name='modulelearnermapping',
			unique_together={('cohort_id', 'module_block_id', 'subprogramme', 'learner_identity')},
		),
	]
