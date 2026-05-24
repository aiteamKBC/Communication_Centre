from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0014_user_activity_tracking'),
    ]

    operations = [
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('action', models.CharField(max_length=40)),
                ('entity', models.CharField(max_length=120)),
                ('object_id', models.TextField(blank=True, default='')),
                ('object_label', models.TextField(blank=True, default='')),
                ('user_id', models.BigIntegerField(blank=True, null=True)),
                ('username', models.TextField(blank=True, default='')),
                ('email', models.TextField(blank=True, default='')),
                ('display_name', models.TextField(blank=True, default='')),
                ('path', models.TextField(blank=True, default='')),
                ('method', models.CharField(blank=True, default='', max_length=16)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.TextField(blank=True, default='')),
                ('before', models.JSONField(blank=True, null=True)),
                ('after', models.JSONField(blank=True, null=True)),
                ('metadata', models.JSONField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'audit_logs',
            },
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['-created_at'], name='audit_logs_created_109d5a_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['entity', '-created_at'], name='audit_logs_entity_59fcd1_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['email', '-created_at'], name='audit_logs_email_b1729d_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['action', '-created_at'], name='audit_logs_action_3981fe_idx'),
        ),
    ]
