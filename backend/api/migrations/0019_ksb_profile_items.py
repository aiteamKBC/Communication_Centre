from django.db import migrations, models


def column_exists(schema_editor, table_name: str, column_name: str) -> bool:
	with schema_editor.connection.cursor() as cursor:
		columns = {
			column.name
			for column in schema_editor.connection.introspection.get_table_description(cursor, table_name)
		}
	return column_name in columns


def add_ksb_items_column(apps, schema_editor):
	table_name = 'ksb_profiles'
	if column_exists(schema_editor, table_name, 'ksb_items'):
		return
	field = models.JSONField(default=list, blank=True)
	field.set_attributes_from_name('ksb_items')
	schema_editor.add_field(apps.get_model('api', 'KsbProfile'), field)


class Migration(migrations.Migration):

	dependencies = [
		('api', '0018_module_session_ksb_json'),
	]

	operations = [
		migrations.SeparateDatabaseAndState(
			database_operations=[
				migrations.RunPython(add_ksb_items_column, migrations.RunPython.noop),
			],
			state_operations=[
				migrations.AddField(
					model_name='ksbprofile',
					name='ksb_items',
					field=models.JSONField(default=list, blank=True),
				),
			],
		),
	]
