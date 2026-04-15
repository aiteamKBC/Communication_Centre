from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('api', '0001_add_news_acknowledged'),
	]

	operations = [
		migrations.CreateModel(
			name='TrainingPlanHoliday',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('label', models.TextField(blank=True, default='')),
				('start_date', models.DateField()),
				('end_date', models.DateField()),
				('type', models.CharField(blank=True, default='holiday', max_length=50)),
				('color', models.CharField(blank=True, default='#FFFBEB', max_length=32)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
			],
			options={
				'db_table': 'training_plan_holidays',
			},
		),
	]
