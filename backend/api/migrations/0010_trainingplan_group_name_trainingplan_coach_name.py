from django.db import migrations


def provision_training_plan_table_for_tests(apps, schema_editor):
	connection = schema_editor.connection
	database_name = str(connection.settings_dict.get('NAME', ''))
	if not database_name.startswith('test_'):
		return

	from api.models import TrainingPlan

	if TrainingPlan._meta.db_table in connection.introspection.table_names():
		return

	schema_editor.create_model(TrainingPlan)


class Migration(migrations.Migration):

	dependencies = [
		('api', '0009_remove_unused_program_config_fields'),
	]

	operations = [
		migrations.RunPython(
			provision_training_plan_table_for_tests,
			reverse_code=migrations.RunPython.noop,
		),
		migrations.RunSQL(
			sql=r"""
				ALTER TABLE "Training_plan"
				ADD COLUMN IF NOT EXISTS group_name text NOT NULL DEFAULT '';

				ALTER TABLE "Training_plan"
				ADD COLUMN IF NOT EXISTS coach_name text NOT NULL DEFAULT '';

				UPDATE "Training_plan"
				SET
					group_name = COALESCE((regexp_match(notes, '(?m)^__group_name:(.*)$'))[1], ''),
					coach_name = COALESCE((regexp_match(notes, '(?m)^__coach_name:(.*)$'))[1], ''),
					notes = trim(
						both E'\n' from regexp_replace(
							regexp_replace(notes, '(?m)^__group_name:.*(?:\n|$)', '', 'g'),
							'(?m)^__coach_name:.*(?:\n|$)',
							'',
							'g'
						)
					)
				WHERE notes ~ E'(?m)^__group_name:' OR notes ~ E'(?m)^__coach_name:';
			""",
			reverse_sql=migrations.RunSQL.noop,
		),
	]
