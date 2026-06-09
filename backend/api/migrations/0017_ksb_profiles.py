from django.db import migrations, models


def add_training_plan_ksb_profile_column(apps, schema_editor):
	table_name = 'Training_plan'
	column_name = 'ksb_profile_id'
	with schema_editor.connection.cursor() as cursor:
		existing_columns = {
			column.name
			for column in schema_editor.connection.introspection.get_table_description(cursor, table_name)
		}
		if column_name in existing_columns:
			return
		cursor.execute(
			f"ALTER TABLE {schema_editor.quote_name(table_name)} "
			f"ADD COLUMN {schema_editor.quote_name(column_name)} bigint NULL"
		)


class Migration(migrations.Migration):

	dependencies = [
		('api', '0016_training_plan_session_ksb_json'),
	]

	operations = [
		migrations.CreateModel(
			name='KsbProfile',
			fields=[
				('id', models.BigAutoField(primary_key=True, serialize=False)),
				('name', models.CharField(max_length=255)),
				('programme_name', models.CharField(blank=True, default='', max_length=255)),
				('description', models.TextField(blank=True, default='')),
				('knowledge_codes', models.JSONField(blank=True, default=list)),
				('skill_codes', models.JSONField(blank=True, default=list)),
				('behaviour_codes', models.JSONField(blank=True, default=list)),
				('is_active', models.BooleanField(default=True)),
				('created_by', models.TextField(blank=True, default='')),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
			],
			options={
				'db_table': 'ksb_profiles',
				'indexes': [models.Index(fields=['is_active', 'name'], name='ksb_profile_is_acti_2347e0_idx')],
			},
		),
		migrations.RunPython(add_training_plan_ksb_profile_column, migrations.RunPython.noop),
	]
