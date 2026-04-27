from django.db import migrations


class Migration(migrations.Migration):

	dependencies = [
		('api', '0010_trainingplan_group_name_trainingplan_coach_name'),
	]

	operations = [
		migrations.RunSQL(
			sql="""
				ALTER TABLE "News"
				DROP COLUMN IF EXISTS acknowledged;
			""",
			reverse_sql="""
				ALTER TABLE "News"
				ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN NOT NULL DEFAULT FALSE;
			""",
		),
	]
