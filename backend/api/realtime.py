from django.core.cache import cache
from django.db import transaction


REALTIME_RESOURCE_ENTITIES = {
	'events': {'Event'},
	'news': {'News'},
	'urgentNotice': {'UrgentNotice', 'Image'},
	'leadershipMessage': {'LeadershipMessage', 'Image'},
	'trainingPlan': {
		'TrainingPlan',
		'TrainingPlanHoliday',
		'TrainingPlanHolidayType',
		'TrainingPlanModuleDefinition',
		'TrainingPlanProgramConfig',
		'Module',
		'TutorProfile',
		'CoachProfile',
		'KsbProfile',
		'ModuleLearnerMapping',
	},
	'training_plan': {
		'TrainingPlan',
		'TrainingPlanHoliday',
		'TrainingPlanHolidayType',
		'TrainingPlanModuleDefinition',
		'TrainingPlanProgramConfig',
		'Module',
		'TutorProfile',
		'CoachProfile',
		'KsbProfile',
		'ModuleLearnerMapping',
	},
	'modules': {'TrainingPlanModuleDefinition', 'Module', 'ModuleLearnerMapping'},
	'cohorts': {'TrainingPlan'},
	'sessions': {'TrainingPlan', 'Module'},
	'coverage': {'TrainingPlan'},
	'ksb': {'TrainingPlan', 'KsbProfile', 'Module'},
	'holidays': {'TrainingPlanHoliday', 'TrainingPlanHolidayType'},
	'employees': {'Employee'},
	'feedback': {'Feedback'},
	'audit_logs': set(),
	'audit': set(),
	'user_activity': {'UserActivitySession'},
	'activity': {'UserActivitySession'},
	'auth_activity': {'UserActivitySession'},
	'page_visits': {'UserActivitySession'},
}

REALTIME_CACHE_PREFIX = 'kbc:realtime:resource:'


def _resource_cache_key(resource: str) -> str:
	return f'{REALTIME_CACHE_PREFIX}{resource}'


def realtime_resource_versions() -> dict[str, int]:
	versions = {}
	for resource in REALTIME_RESOURCE_ENTITIES:
		try:
			versions[resource] = int(cache.get(_resource_cache_key(resource)) or 0)
		except (TypeError, ValueError):
			versions[resource] = 0
	return versions


def emit_realtime_resource_change(*resources: str) -> None:
	for resource in {item for item in resources if item in REALTIME_RESOURCE_ENTITIES}:
		key = _resource_cache_key(resource)
		try:
			cache.add(key, 0, timeout=None)
			cache.incr(key)
		except Exception:
			cache.set(key, 1, timeout=None)


def emit_realtime_resource_change_on_commit(*resources: str) -> None:
	transaction.on_commit(lambda: emit_realtime_resource_change(*resources))


def resources_for_entity(entity: str) -> list[str]:
	return [
		resource
		for resource, entities in REALTIME_RESOURCE_ENTITIES.items()
		if entity in entities
	]
