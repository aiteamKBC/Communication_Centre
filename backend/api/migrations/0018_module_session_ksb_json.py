from django.db import migrations


def add_module_session_ksb_column(apps, schema_editor):
	table_name = 'Modules'
	column_name = 'session_ksb_json'
	with schema_editor.connection.cursor() as cursor:
		existing_columns = {
			column.name
			for column in schema_editor.connection.introspection.get_table_description(cursor, table_name)
		}
		if column_name in existing_columns:
			return
		cursor.execute(
			f"ALTER TABLE {schema_editor.quote_name(table_name)} "
			f"ADD COLUMN {schema_editor.quote_name(column_name)} text NOT NULL DEFAULT ''"
		)


class Migration(migrations.Migration):

	dependencies = [
		('api', '0017_ksb_profiles'),
	]

	operations = [
		migrations.RunPython(add_module_session_ksb_column, migrations.RunPython.noop),
	]
