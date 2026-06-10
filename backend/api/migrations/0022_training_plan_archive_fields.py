from django.db import migrations


def add_training_plan_archive_columns(apps, schema_editor):
	table_name = 'Training_plan'
	quote = schema_editor.quote_name
	with schema_editor.connection.cursor() as cursor:
		existing_columns = {
			column.name
			for column in schema_editor.connection.introspection.get_table_description(cursor, table_name)
		}
		if 'is_archived' not in existing_columns:
			cursor.execute(
				f"ALTER TABLE {quote(table_name)} "
				f"ADD COLUMN {quote('is_archived')} boolean NOT NULL DEFAULT false"
			)
		if 'archived_at' not in existing_columns:
			cursor.execute(
				f"ALTER TABLE {quote(table_name)} "
				f"ADD COLUMN {quote('archived_at')} timestamp with time zone NULL"
			)
		if 'archived_by' not in existing_columns:
			cursor.execute(
				f"ALTER TABLE {quote(table_name)} "
				f"ADD COLUMN {quote('archived_by')} text NOT NULL DEFAULT ''"
			)
		if 'archive_reason' not in existing_columns:
			cursor.execute(
				f"ALTER TABLE {quote(table_name)} "
				f"ADD COLUMN {quote('archive_reason')} text NOT NULL DEFAULT ''"
			)


class Migration(migrations.Migration):

	dependencies = [
		('api', '0021_training_plan_display_order'),
	]

	operations = [
		migrations.RunPython(add_training_plan_archive_columns, migrations.RunPython.noop),
	]
