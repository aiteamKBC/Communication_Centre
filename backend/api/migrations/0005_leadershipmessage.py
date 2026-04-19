from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('api', '0004_remove_urgentnotice_cta_fields'),
	]

	operations = [
		migrations.CreateModel(
			name='LeadershipMessage',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('card_title', models.TextField(blank=True, default='')),
				('card_teaser', models.TextField(blank=True, default='')),
				('author_name', models.CharField(blank=True, default='', max_length=150)),
				('author_role', models.CharField(blank=True, default='', max_length=200)),
				('publication_date', models.DateField(blank=True, null=True)),
				('body', models.TextField(blank=True, default='')),
				('cover_image_url', models.TextField(blank=True, default='')),
				('profile_image_url', models.TextField(blank=True, default='')),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
			],
			options={
				'db_table': 'leadership_messages',
			},
		),
	]
