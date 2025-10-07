# apiapp/services/scheduler_runner.py
from django.utils import timezone
from apiapp.models import WorkflowScheduler, WorkflowSchedulerLog
from celery import current_app as app
from croniter import croniter
from apiapp.models import WorkflowRun

def run_due_workflow_schedules():
    """
    Core logic: checks WorkflowScheduler table and queues due workflows.
    Returns a list of result dicts for logging or API responses.
    """
    now = timezone.now()
    results = []

    # 1️⃣ Initialize next_run for any active schedules missing it
    for sched in WorkflowScheduler.objects.filter(is_active=True, next_run__isnull=True):
        try:
            sched.next_run = croniter(sched.cron_expression, now).get_next(timezone.datetime)
            sched.save()
        except Exception as e:
            WorkflowSchedulerLog.objects.create(
                scheduler=sched,
                status="ERROR",
                message=f"Exception setting next_run: {e}",
            )

    # 2️⃣ Queue due schedules
    for sched in WorkflowScheduler.objects.filter(is_active=True, next_run__lte=now):
        try:
            task = app.send_task(
                "worker.run_workflow",
                args=[sched.workflow.id, sched.id],
                queue="workflows",
            )

            sched.last_run = now
            sched.next_run = croniter(sched.cron_expression, now).get_next(timezone.datetime)
            sched.save()

            WorkflowSchedulerLog.objects.create(
                scheduler=sched,
                status="QUEUED",
                message=f"Task {task.id} queued for workflow {sched.workflow.id}",
            )

            results.append({
                "id": sched.id,
                "task_id": task.id,
                "status": "QUEUED",
                "workflow_id": sched.workflow.id,
            })
        except Exception as e:
            WorkflowSchedulerLog.objects.create(
                scheduler=sched,
                status="ERROR",
                message=f"Exception: {e}",
            )
            results.append({
                "id": sched.id,
                "status": "ERROR",
                "error": str(e),
                "workflow_id": sched.workflow.id,
            })

    return results
