from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('api', '0007_urgentnotice_is_active'),
	]

	operations = [
		migrations.CreateModel(
			name='TrainingPlanModuleDefinition',
			fields=[
				('id', models.BigAutoField(primary_key=True, serialize=False)),
				('module_id', models.CharField(max_length=150, unique=True)),
				('name', models.CharField(max_length=255)),
				('default_sessions', models.PositiveIntegerField(default=1)),
				('bg', models.CharField(default='#4A6DB0', max_length=32)),
				('tx', models.CharField(default='#ffffff', max_length=32)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
			],
			options={'db_table': 'training_plan_module_definitions'},
		),
		migrations.CreateModel(
			name='TrainingPlanProgramConfig',
			fields=[
				('id', models.BigAutoField(primary_key=True, serialize=False)),
				('program_id', models.CharField(max_length=150, unique=True)),
				('name', models.CharField(max_length=255)),
				('sub', models.TextField(blank=True, default='')),
				('color', models.CharField(default='#1B2A4A', max_length=32)),
				('row_bg', models.CharField(default='rgba(27,42,74,0.04)', max_length=64)),
				('is_builtin', models.BooleanField(default=False)),
				('is_hidden', models.BooleanField(default=False)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
			],
			options={'db_table': 'training_plan_program_configs'},
		),
	]
