from django.db import migrations


def add_module_session_columns(apps, schema_editor):
	table_name = 'Modules'
	existing_columns = {
		column.name
		for column in schema_editor.connection.introspection.get_table_description(
			schema_editor.connection.cursor(),
			table_name,
		)
	}

	with schema_editor.connection.cursor() as cursor:
		for index in range(14, 31):
			for prefix in ('session_name', 'session_description'):
				column_name = f'{prefix}_{index}'
				if column_name in existing_columns:
					continue
				quoted_table = schema_editor.quote_name(table_name)
				quoted_column = schema_editor.quote_name(column_name)
				cursor.execute(f"ALTER TABLE {quoted_table} ADD COLUMN {quoted_column} text NOT NULL DEFAULT ''")


class Migration(migrations.Migration):

	dependencies = [
		('api', '0011_remove_news_acknowledged'),
	]

	operations = [
		migrations.RunPython(add_module_session_columns, migrations.RunPython.noop),
	]
