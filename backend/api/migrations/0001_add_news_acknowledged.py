from django.db import migrations


def provision_news_table_for_tests(apps, schema_editor):
    connection = schema_editor.connection
    database_name = str(connection.settings_dict.get('NAME', ''))
    if not database_name.startswith('test_'):
        return

    from api.models import News

    if News._meta.db_table in connection.introspection.table_names():
        return

    schema_editor.create_model(News)


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.RunPython(
            provision_news_table_for_tests,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.RunSQL(
            sql="""
                ALTER TABLE "News"
                ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN NOT NULL DEFAULT FALSE;
            """,
            reverse_sql="""
                ALTER TABLE "News"
                DROP COLUMN IF EXISTS acknowledged;
            """,
        ),
    ]
