from django.db import migrations, models


def seed_active_urgent_notice(apps, schema_editor):
	UrgentNotice = apps.get_model('api', 'UrgentNotice')
	latest_notice = UrgentNotice.objects.order_by('-created_at', '-id').first()
	if latest_notice:
		UrgentNotice.objects.exclude(pk=latest_notice.pk).update(is_active=False)
		latest_notice.is_active = True
		latest_notice.save(update_fields=['is_active'])


class Migration(migrations.Migration):

	dependencies = [
		('api', '0006_leadershipmessage_is_active'),
	]

	operations = [
		migrations.AddField(
			model_name='urgentnotice',
			name='is_active',
			field=models.BooleanField(default=False),
		),
		migrations.RunPython(seed_active_urgent_notice, migrations.RunPython.noop),
	]
