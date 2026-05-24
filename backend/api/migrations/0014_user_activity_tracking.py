from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0013_module_dynamic_session_json'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserActivitySession',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('tracking_session_id', models.UUIDField(unique=True)),
                ('user_id', models.BigIntegerField(blank=True, null=True)),
                ('username', models.TextField(blank=True, default='')),
                ('email', models.TextField(blank=True, default='')),
                ('display_name', models.TextField(blank=True, default='')),
                ('auth_provider', models.CharField(blank=True, default='password', max_length=50)),
                ('login_at', models.DateTimeField()),
                ('logout_at', models.DateTimeField(blank=True, null=True)),
                ('last_seen_at', models.DateTimeField()),
                ('total_seconds', models.PositiveIntegerField(default=0)),
                ('page_count', models.PositiveIntegerField(default=0)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.TextField(blank=True, default='')),
                ('logout_reason', models.CharField(blank=True, default='', max_length=80)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'user_activity_sessions',
            },
        ),
        migrations.CreateModel(
            name='UserPageVisit',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('path', models.TextField()),
                ('title', models.TextField(blank=True, default='')),
                ('first_seen_at', models.DateTimeField()),
                ('last_seen_at', models.DateTimeField()),
                ('duration_seconds', models.PositiveIntegerField(default=0)),
                ('view_count', models.PositiveIntegerField(default=1)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='page_visits', to='api.useractivitysession')),
            ],
            options={
                'db_table': 'user_page_visits',
                'unique_together': {('session', 'path')},
            },
        ),
        migrations.AddIndex(
            model_name='useractivitysession',
            index=models.Index(fields=['user_id', '-login_at'], name='user_activi_user_id_ef541a_idx'),
        ),
        migrations.AddIndex(
            model_name='useractivitysession',
            index=models.Index(fields=['email', '-login_at'], name='user_activi_email_5bb0c8_idx'),
        ),
        migrations.AddIndex(
            model_name='useractivitysession',
            index=models.Index(fields=['tracking_session_id'], name='user_activi_trackin_4dc0cb_idx'),
        ),
        migrations.AddIndex(
            model_name='userpagevisit',
            index=models.Index(fields=['path'], name='user_page_v_path_79950c_idx'),
        ),
        migrations.AddIndex(
            model_name='userpagevisit',
            index=models.Index(fields=['-last_seen_at'], name='user_page_v_last_se_d73861_idx'),
        ),
    ]
