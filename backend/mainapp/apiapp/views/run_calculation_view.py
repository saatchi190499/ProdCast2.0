from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from mainapp.celery import app
from rest_framework.permissions import IsAuthenticated
from ..models import ScenarioClass
import os
from rest_framework.decorators import api_view
from croniter import croniter
from django.utils import timezone
from ..models import WorkflowScheduler, ServersClass, WorkflowSchedulerLog
from django.http import JsonResponse
# Функция для получения статуса задачи по её ID.
import json
import redis
from django.conf import settings

class RunCalculationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, scenario_id):
        start_date = request.data.get("start_date")
        end_date = request.data.get("end_date")

        if not scenario_id or not start_date or not end_date:
            return Response({"error": "Missing parameters"}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Отправляем задачу напрямую по имени
        task = app.send_task(
            "worker.run_scenario",  # <-- имя задачи, как у воркера
            args=[scenario_id, start_date, end_date]
        )

        # 2. Сохраняем task_id в сценарии и меняем статус
        scenario = ScenarioClass.objects.get(pk=scenario_id)
        scenario.task_id = task.id
        scenario.status = "QUEUED"
        scenario.save()

        return Response({"task_id": task.id, "status": "QUEUED"})


# Подключение к Redis (замени host/port/db при необходимости)
r = redis.Redis.from_url(settings.CELERY_BROKER_URL)

def get_scenarios_status(request):
    statuses = ["PENDING", "STARTED", "SUCCESS", "FAILURE", "RETRY", "QUEUED"]
    result = {s: [] for s in statuses}

    # === 1. Сценарии из БД ===
    for scenario in ScenarioClass.objects.all():
        status = scenario.status
        redis_status = None

        if scenario.task_id:
            redis_key = f"celery-task-meta-{scenario.task_id}"
            data = r.get(redis_key)
            if data:
                try:
                    meta = json.loads(data)
                    redis_status = meta.get("status")
                except Exception as e:
                    print(f"Redis parsing error {scenario.task_id}: {e}")

        if redis_status:
            status = redis_status
            
        if status != "QUEUED":
            result.setdefault(status, []).append({
                "id": scenario.scenario_id,
                "name": scenario.scenario_name,
                "task_id": scenario.task_id,
                "status": status,
                "description": scenario.description,
            })

    # === 2. Задачи в очереди Redis ===
    try:
        queued_tasks = r.lrange("celery", 0, -1)
        seen_ids = set()  # чтобы не дублировать
        for raw in queued_tasks:
            try:
                task = json.loads(raw)
                task_id = (
                    task.get("headers", {}).get("id")
                    or task.get("properties", {}).get("correlation_id")
                )

                if not task_id or task_id in seen_ids:
                    continue  # уже добавляли → пропускаем
                seen_ids.add(task_id)

                args = task.get("headers", {}).get("argsrepr", "")

                # пробуем найти сценарий по task_id
                scenario = ScenarioClass.objects.filter(task_id=task_id).first()
                scenario_name = scenario.scenario_name if scenario else f"Task {task_id}"

                result["QUEUED"].append({
                    "id": scenario.scenario_id if scenario else None,
                    "name": scenario_name,
                    "task_id": task_id,
                    "status": "QUEUED",
                    "description": f"Pending start. Arguments: {args}",
                })
            except Exception as e:
                print(f"Failed to parse queued task: {e}")
    except Exception as e:
        print(f"Failed to read Redis queue: {e}")

    return JsonResponse(result)

def get_workers_status():
    insp = app.control.inspect()

    try:
        ping = insp.ping() or {}
    except Exception as e:
        ping = {}
        print(f"Ошибка ping: {e}")

    result = []
    for worker_name, reply in ping.items():
        result.append({
            "worker": worker_name,
            "status": reply.get("ok", "offline"),
        })

    # если нет воркеров — показываем offline
    if not result:
        result.append({
            "worker": "No workers",
            "status": "offline",
        })

    return result

def workers_schedule_view(request):
    scenarios_status = get_scenarios_status(request)  # твоя функция для PENDING/STARTED/...
    workers_status = get_workers_status()            # твоя функция для ping/active/reserved

    return JsonResponse({
        "workers": workers_status,
        **json.loads(scenarios_status.content.decode())  # объединяем
    })

##################################Workflow#########################################
def run_due_workflow_schedules():
    now = timezone.now()
    for sched in WorkflowScheduler.objects.filter(is_active=True, next_run__lte=now):
        servers = ServersClass.objects.filter(is_active=True, allow_workflows=True)
        if not servers.exists():
            WorkflowSchedulerLog.objects.create(
                scheduler=sched,
                status="NO_SERVER",
                message="❌ No servers available for workflows"
            )
            continue

        try:
            task = app.send_task("worker.run_workflow", args=[sched.workflow.id], queue="default")

            sched.last_run = now
            sched.next_run = croniter(sched.cron_expression, now).get_next(timezone.datetime)
            sched.save()

            WorkflowSchedulerLog.objects.create(
                scheduler=sched,
                status="QUEUED",
                message=f"Task {task.id} queued for workflow {sched.workflow.id}"
            )

        except Exception as e:
            WorkflowSchedulerLog.objects.create(
                scheduler=sched,
                status="ERROR",
                message=f"Exception: {e}"
            )
        