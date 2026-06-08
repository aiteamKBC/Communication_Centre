import re

from django.db import migrations, models


def normalize_tutor_name(value):
	return re.sub(r'\s+', ' ', re.sub(r'[^\w\s@.-]+', ' ', str(value or '').lower())).strip()


def add_training_plan_tutor_profile_column(apps, schema_editor):
	table_name = 'Training_plan'
	with schema_editor.connection.cursor() as cursor:
		existing_columns = {
			column.name
			for column in schema_editor.connection.introspection.get_table_description(cursor, table_name)
		}
		if 'tutor_profile_id' not in existing_columns:
			cursor.execute(
				f"ALTER TABLE {schema_editor.quote_name(table_name)} "
				f"ADD COLUMN {schema_editor.quote_name('tutor_profile_id')} bigint NULL"
			)
		if 'session_coverage_json' not in existing_columns:
			cursor.execute(
				f"ALTER TABLE {schema_editor.quote_name(table_name)} "
				f"ADD COLUMN {schema_editor.quote_name('session_coverage_json')} text NOT NULL DEFAULT ''"
			)


def seed_tutor_profiles_and_exact_links(apps, schema_editor):
	TutorProfile = apps.get_model('api', 'TutorProfile')
	profiles_by_normalized = {
		profile.normalized_name: profile
		for profile in TutorProfile.objects.all()
	}

	with schema_editor.connection.cursor() as cursor:
		cursor.execute(
			f"SELECT {schema_editor.quote_name('id')}, {schema_editor.quote_name('Tutor_name')}, {schema_editor.quote_name('tutor_profile_id')} "
			f"FROM {schema_editor.quote_name('Training_plan')} "
			f"ORDER BY {schema_editor.quote_name('id')}"
		)
		for row_id, raw_name, tutor_profile_id in cursor.fetchall():
			name = str(raw_name or '').strip()
			normalized_name = normalize_tutor_name(name)
			if not name or not normalized_name:
				continue
			profile = profiles_by_normalized.get(normalized_name)
			if profile is None:
				profile = TutorProfile.objects.create(name=name, normalized_name=normalized_name)
				profiles_by_normalized[normalized_name] = profile
			if tutor_profile_id:
				continue
			cursor.execute(
				f"UPDATE {schema_editor.quote_name('Training_plan')} "
				f"SET {schema_editor.quote_name('tutor_profile_id')} = %s "
				f"WHERE {schema_editor.quote_name('id')} = %s",
				[profile.id, row_id],
			)


class Migration(migrations.Migration):

	dependencies = [
		('api', '0019_ksb_profile_items'),
	]

	operations = [
		migrations.CreateModel(
			name='TutorProfile',
			fields=[
				('id', models.BigAutoField(primary_key=True, serialize=False)),
				('name', models.CharField(max_length=255)),
				('normalized_name', models.CharField(max_length=255, unique=True)),
				('email', models.EmailField(blank=True, default='', max_length=254)),
				('phone', models.CharField(blank=True, default='', max_length=80)),
				('notes', models.TextField(blank=True, default='')),
				('availability_notes', models.TextField(blank=True, default='')),
				('is_active', models.BooleanField(default=True)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
			],
			options={
				'db_table': 'tutor_profiles',
				'indexes': [
					models.Index(fields=['is_active', 'name'], name='tutor_profi_is_acti_2d7e38_idx'),
					models.Index(fields=['normalized_name'], name='tutor_profi_normali_34d7cb_idx'),
				],
			},
		),
		migrations.RunPython(add_training_plan_tutor_profile_column, migrations.RunPython.noop),
		migrations.RunPython(seed_tutor_profiles_and_exact_links, migrations.RunPython.noop),
	]
