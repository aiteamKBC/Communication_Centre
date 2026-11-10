from django.db import migrations, models


def protect_reference(apps, schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        schema_editor.execute('''
            CREATE FUNCTION training_plan_lms_reference_immutable() RETURNS trigger
            LANGUAGE plpgsql AS $$ BEGIN
                RAISE EXCEPTION 'LMS reference is read only' USING ERRCODE='23514';
            END $$;
            CREATE TRIGGER training_plan_lms_reference_immutable
            BEFORE UPDATE OR DELETE ON training_plan_lms_reference
            FOR EACH ROW EXECUTE FUNCTION training_plan_lms_reference_immutable();
        ''')


def unprotect_reference(apps, schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        schema_editor.execute('''
            DROP TRIGGER IF EXISTS training_plan_lms_reference_immutable ON training_plan_lms_reference;
            DROP FUNCTION IF EXISTS training_plan_lms_reference_immutable();
        ''')


class Migration(migrations.Migration):
    dependencies = [('api', '0025_scope_module_learner_mappings')]
    operations = [
        migrations.CreateModel(
            name='TrainingPlanLmsReference',
            fields=[
                ('id', models.PositiveSmallIntegerField(default=1, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.JSONField()),
                ('records', models.JSONField()),
                ('content_sha256', models.CharField(max_length=64)),
            ],
            options={'db_table': 'training_plan_lms_reference', 'constraints': [
                models.CheckConstraint(condition=models.Q(id=1), name='tp_lms_reference_singleton'),
            ]},
        ),
        migrations.RunPython(protect_reference, unprotect_reference),
    ]
