# apiapp/tasks.py
from celery import shared_task
from apiapp.services.scheduler_runner import run_due_workflow_schedules

@shared_task(name="mainserver.run_workflow_schedules")
def run_workflow_schedules():
    """
    This Celery task is triggered by Beat every minute.
    It reuses the same scheduler logic as the API view.
    """
    print("[Celery Scheduler] run_workflow_schedules triggered!")
    results = run_due_workflow_schedules()
    print(f"[Celery Scheduler] Results: {results}")
    return results
