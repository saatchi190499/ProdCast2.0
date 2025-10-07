from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from mainapp.celery import app
from rest_framework.permissions import IsAuthenticated
from ..models import ScenarioClass, WorkflowRun, ScenarioLog
from apiapp.services.scheduler_runner import run_due_workflow_schedules
import json
import redis
import signal
from django.conf import settings

# Redis client
r = redis.Redis.from_url(settings.CELERY_BROKER_URL)

# ---------- Run Scenario ----------
class RunScenarioView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, scenario_id):
        start_date = request.data.get("start_date")
        end_date = request.data.get("end_date")

        if not scenario_id or not start_date or not end_date:
            return Response({"error": "Missing parameters"}, status=status.HTTP_400_BAD_REQUEST)

        task = app.send_task(
            "worker.run_scenario",
            args=[scenario_id, start_date, end_date],
            queue="scenarios"
        )

        scenario = ScenarioClass.objects.get(pk=scenario_id)
        scenario.task_id = task.id
        scenario.status = "QUEUED"
        scenario.save()

        return Response({"task_id": task.id, "status": "QUEUED"})


# ---------- Run Workflow Schedules ----------
class RunWorkflowSchedulesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        results = run_due_workflow_schedules()
        return Response(results)

class WorkersStatusView(APIView):
    """
    Возвращает список воркеров, статусы и задачи в очередях
    """
    def get(self, request):
        insp = app.control.inspect()

        try:
            ping = insp.ping() or {}
        except Exception as e:
            ping = {}
            print(f"Ping error: {e}")

        workers = []
        for worker_name, reply in ping.items():
            workers.append({
                "worker": worker_name,
                "status": reply.get("ok", "offline"),
            })

        if not workers:
            workers.append({"worker": "No workers", "status": "offline"})

        queues = {}
        tasks_preview = {}

        for queue in ["scenarios", "workflows"]:
            try:
                length = r.llen(queue)
                queues[queue] = length

                # просмотр до 20 задач
                tasks_preview[queue] = []
                for raw in r.lrange(queue, 0, 19):
                    try:
                        task = json.loads(raw)
                        task_id = (
                            task.get("headers", {}).get("id")
                            or task.get("properties", {}).get("correlation_id")
                        )
                        args = task.get("headers", {}).get("argsrepr", "")
                        tasks_preview[queue].append({
                            "task_id": task_id,
                            "args": args,
                        })
                    except Exception as e:
                        print(f"Parse error in queue {queue}: {e}")
            except Exception as e:
                queues[queue] = None
                tasks_preview[queue] = []
                print(f"Redis error for {queue}: {e}")

        return Response({
            "workers": workers,
            "queues": queues,
            "tasks": tasks_preview,
        })

class TaskManagementView(APIView):
    """
    Управление задачами Celery:
    - Удаление из очереди Redis (ещё не запущена)
    - Прерывание активной задачи (revoke)
    """
    def delete(self, request, task_id):
        queue = request.query_params.get("queue", "workflows")
        revoke_flag = request.query_params.get("revoke")

        try:
            r = redis.Redis.from_url(settings.CELERY_BROKER_URL)
        except Exception as e:
            return Response({"error": f"Redis connection failed: {e}"}, status=500)

        # --- Если нужно прервать запущенную задачу ---
        if revoke_flag:
            try:
                app.control.revoke(task_id, terminate=True, signal=signal.SIGTERM)

                # обновляем статус в БД
                WorkflowRun.objects.filter(task_id=task_id).update(status="REVOKED")
                ScenarioLog.objects.filter(scenario__task_id=task_id).update(message="Task revoked manually")

                return Response({
                    "task_id": task_id,
                    "queue": queue,
                    "action": "revoked"
                })
            except Exception as e:
                return Response({"error": f"Revoke failed: {e}"}, status=500)

        # --- Удаление из очереди Redis ---
        try:
            removed = False
            raw_tasks = r.lrange(queue, 0, -1)

            for raw in raw_tasks:
                try:
                    task = json.loads(raw)
                except Exception:
                    continue

                t_id = (
                    task.get("headers", {}).get("id")
                    or task.get("properties", {}).get("correlation_id")
                )
                if t_id == task_id:
                    r.lrem(queue, 1, raw)
                    removed = True
                    break

            if removed:
                # обновляем статус в WorkflowRun
                WorkflowRun.objects.filter(task_id=task_id).update(status="REMOVED")
                return Response({
                    "task_id": task_id,
                    "queue": queue,
                    "action": "deleted",
                    "db_status": "REMOVED"
                })

            else:
                return Response({
                    "task_id": task_id,
                    "queue": queue,
                    "action": "not_found"
                }, status=status.HTTP_404_NOT_FOUND)

        except Exception as e:
            return Response({"error": f"Redis operation failed: {e}"}, status=500)