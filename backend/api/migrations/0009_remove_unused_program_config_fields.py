from django.db import migrations


class Migration(migrations.Migration):

	dependencies = [
		('api', '0008_trainingplanmoduledefinition_trainingplanprogramconfig'),
	]

	operations = [
		migrations.RemoveField(
			model_name='trainingplanprogramconfig',
			name='is_builtin',
		),
		migrations.RemoveField(
			model_name='trainingplanprogramconfig',
			name='is_hidden',
		),
		migrations.RemoveField(
			model_name='trainingplanprogramconfig',
			name='row_bg',
		),
	]
