import json

from django.db import migrations


LEGACY_SESSION_FIELDS = 30


def add_dynamic_session_columns(apps, schema_editor):
	table_name = 'Modules'
	with schema_editor.connection.cursor() as cursor:
		existing_columns = {
			column.name
			for column in schema_editor.connection.introspection.get_table_description(cursor, table_name)
		}
		quoted_table = schema_editor.quote_name(table_name)
		for column_name in ('session_names_json', 'session_descriptions_json'):
			if column_name not in existing_columns:
				quoted_column = schema_editor.quote_name(column_name)
				cursor.execute(f"ALTER TABLE {quoted_table} ADD COLUMN {quoted_column} text NOT NULL DEFAULT ''")


def migrate_legacy_sessions_to_json(apps, schema_editor):
	table_name = 'Modules'
	id_column = 'Module ID'
	name_fields = [f'session_name_{i}' for i in range(1, LEGACY_SESSION_FIELDS + 1)]
	description_fields = [f'session_description_{i}' for i in range(1, LEGACY_SESSION_FIELDS + 1)]

	with schema_editor.connection.cursor() as cursor:
		quoted_table = schema_editor.quote_name(table_name)
		select_columns = [id_column, 'session_names_json', 'session_descriptions_json', *name_fields, *description_fields]
		cursor.execute(
			f"SELECT {', '.join(schema_editor.quote_name(column) for column in select_columns)} FROM {quoted_table}"
		)
		rows = cursor.fetchall()

		for row in rows:
			module_id = row[0]
			existing_names_json = row[1] or ''
			existing_descriptions_json = row[2] or ''
			if existing_names_json and existing_descriptions_json:
				continue

			names_start = 3
			descriptions_start = names_start + LEGACY_SESSION_FIELDS
			names = [str(value or '') for value in row[names_start:descriptions_start]]
			descriptions = [str(value or '') for value in row[descriptions_start:descriptions_start + LEGACY_SESSION_FIELDS]]
			cursor.execute(
				f"""
				UPDATE {quoted_table}
				SET
					{schema_editor.quote_name('session_names_json')} = %s,
					{schema_editor.quote_name('session_descriptions_json')} = %s
				WHERE {schema_editor.quote_name(id_column)} = %s
				""",
				[
					existing_names_json or json.dumps(names, ensure_ascii=False),
					existing_descriptions_json or json.dumps(descriptions, ensure_ascii=False),
					module_id,
				],
			)


class Migration(migrations.Migration):

	dependencies = [
		('api', '0012_extend_module_session_fields'),
	]

	operations = [
		migrations.RunPython(add_dynamic_session_columns, migrations.RunPython.noop),
		migrations.RunPython(migrate_legacy_sessions_to_json, migrations.RunPython.noop),
	]
