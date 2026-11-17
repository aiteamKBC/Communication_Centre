from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [('login', '0001_fix_admin_log_fk'), ('auth', '0012_alter_user_first_name_max_length')]

    operations = [
        migrations.CreateModel(
            name='CommunicationAccess', fields=[],
            options={
                'verbose_name': 'Communication Centre access',
                'verbose_name_plural': 'Communication Centre access',
                'proxy': True, 'default_permissions': (),
                'permissions': (
                    ('view_news', 'Can view news & announcements'),
                    ('add_news', 'Can add news & announcements'),
                    ('change_news', 'Can change news & announcements'),
                    ('delete_news', 'Can delete news & announcements'),
                    ('view_events', 'Can view events'), ('add_events', 'Can add events'),
                    ('change_events', 'Can change events'), ('delete_events', 'Can delete events'),
                    ('view_training_plan', 'Can view training plan'), ('add_training_plan', 'Can add training plan'),
                    ('change_training_plan', 'Can change training plan'), ('delete_training_plan', 'Can delete training plan'),
                    ('view_dashboard_cards', 'Can view dashboard cards'), ('add_dashboard_cards', 'Can add dashboard cards'),
                    ('change_dashboard_cards', 'Can change dashboard cards'), ('delete_dashboard_cards', 'Can delete dashboard cards'),
                    ('view_employees', 'Can view departments'), ('add_employees', 'Can add departments'),
                    ('change_employees', 'Can change departments'), ('delete_employees', 'Can delete departments'),
                    ('view_user_activity', 'Can view user activity & audit logs'),
                ),
                'indexes': [], 'constraints': [],
            }, bases=('auth.group',),
        ),
    ]
