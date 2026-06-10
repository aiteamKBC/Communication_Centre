from django.db import migrations


PROGRAM_ID_MARKER_PREFIX = '__program_id:'
COHORT_ID_MARKER_PREFIX = '__cohort_id:'


def _marker_value(notes, prefix):
	reading_markers = True
	for raw_line in str(notes or '').splitlines():
		line = raw_line.strip()
		if not line:
			continue
		if reading_markers and line.startswith(prefix):
			value = line[len(prefix):].strip()
			return value or ''
		if not line.startswith('__'):
			reading_markers = False
	return ''


def _normal_key(value):
	return ' '.join(str(value or '').strip().lower().split())


def add_and_backfill_training_plan_display_order(apps, schema_editor):
	table_name = 'Training_plan'
	quote = schema_editor.quote_name
	with schema_editor.connection.cursor() as cursor:
		existing_columns = {
			column.name
			for column in schema_editor.connection.introspection.get_table_description(cursor, table_name)
		}
		if 'programme_display_order' not in existing_columns:
			cursor.execute(
				f"ALTER TABLE {quote(table_name)} "
				f"ADD COLUMN {quote('programme_display_order')} integer NULL"
			)
		if 'cohort_display_order' not in existing_columns:
			cursor.execute(
				f"ALTER TABLE {quote(table_name)} "
				f"ADD COLUMN {quote('cohort_display_order')} integer NULL"
			)

		cursor.execute(
			f"SELECT {quote('id')}, {quote('Program')}, {quote('Cohort_name')}, "
			f"{quote('Starting_date_lable')}, {quote('notes')}, "
			f"{quote('programme_display_order')}, {quote('cohort_display_order')} "
			f"FROM {quote(table_name)} ORDER BY {quote('id')}"
		)
		rows = cursor.fetchall()

	programme_first_seen = {}
	cohort_first_seen = {}
	row_keys = []
	for row_id, program, cohort_name, starting_date_label, notes, programme_order, cohort_order in rows:
		programme_key = _marker_value(notes, PROGRAM_ID_MARKER_PREFIX) or _normal_key(program) or f'row:{row_id}'
		cohort_key = (
			programme_key,
			_marker_value(notes, COHORT_ID_MARKER_PREFIX)
			or f"{_normal_key(cohort_name)}::{_normal_key(starting_date_label)}"
			or f'row:{row_id}',
		)
		programme_first_seen.setdefault(programme_key, row_id)
		cohort_first_seen.setdefault(cohort_key, row_id)
		row_keys.append((row_id, programme_key, cohort_key, programme_order, cohort_order))

	programme_orders = {
		key: index
		for index, (key, _) in enumerate(sorted(programme_first_seen.items(), key=lambda item: item[1]))
	}
	cohort_orders_by_programme = {}
	for cohort_key, first_row_id in sorted(cohort_first_seen.items(), key=lambda item: item[1]):
		programme_key = cohort_key[0]
		cohort_orders_by_programme.setdefault(programme_key, [])
		cohort_orders_by_programme[programme_key].append(cohort_key)
	cohort_orders = {
		cohort_key: index
		for cohorts in cohort_orders_by_programme.values()
		for index, cohort_key in enumerate(cohorts)
	}

	with schema_editor.connection.cursor() as cursor:
		for row_id, programme_key, cohort_key, programme_order, cohort_order in row_keys:
			next_programme_order = programme_order if programme_order is not None else programme_orders[programme_key]
			next_cohort_order = cohort_order if cohort_order is not None else cohort_orders[cohort_key]
			if next_programme_order == programme_order and next_cohort_order == cohort_order:
				continue
			cursor.execute(
				f"UPDATE {quote(table_name)} "
				f"SET {quote('programme_display_order')} = %s, {quote('cohort_display_order')} = %s "
				f"WHERE {quote('id')} = %s",
				[next_programme_order, next_cohort_order, row_id],
			)


class Migration(migrations.Migration):

	dependencies = [
		('api', '0020_tutor_profiles'),
	]

	operations = [
		migrations.RunPython(add_and_backfill_training_plan_display_order, migrations.RunPython.noop),
	]
