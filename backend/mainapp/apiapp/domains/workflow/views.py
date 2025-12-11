import json
import os
from datetime import datetime
from pathlib import Path

import nbformat
import redis
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apiapp.domains.data.models import DataSourceComponent
from apiapp.domains.workflow.models import Workflow, WorkflowRun, WorkflowScheduler, WorkflowSchedulerLog
from apiapp.domains.workflow.serializers import (
    WorkflowListSerializer,
    WorkflowRunSerializer,
    WorkflowSchedulerLogSerializer,
    WorkflowSchedulerSerializer,
    WorkflowSerializer,
)
from apiapp.services.scheduler_runner import run_due_workflow_schedules
from mainapp.celery import app as celery_app
from apiapp.utils.notebook_converter import block_to_python, python_to_block


def workflow_version_path(workflow, ext="py"):
    ts = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    return os.path.join("workflows", str(workflow.id), f"{workflow.id}_{ts}.{ext}")


class WorkflowViewSet(viewsets.ModelViewSet):
    queryset = Workflow.objects.all()
    serializer_class = WorkflowSerializer
    lookup_field = "component_id"

    def get_object(self):
        component_id = self.kwargs.get("component_id")
        component = get_object_or_404(DataSourceComponent, pk=component_id)
        workflow, _ = Workflow.objects.get_or_create(component=component)
        return workflow

    @action(detail=False, methods=["get"], url_path="all")
    def list_all(self, request):
        workflows = Workflow.objects.select_related("component").all()
        serializer = WorkflowListSerializer(workflows, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="versions")
    def versions(self, request, component_id=None):
        wf = self.get_object()
        base = Path(settings.MEDIA_ROOT) / "workflows" / str(wf.id)
        versions = []

        if base.exists():
            for f in base.glob(f"{wf.id}_*.py"):
                ts = f.stem.split("_", 1)[1]
                versions.append(ts)

        active = ""
        if wf.code_file:
            try:
                active = Path(wf.code_file.name).stem.split("_", 1)[1]
            except Exception:
                active = ""

        return Response({"versions": sorted(versions, reverse=True), "active": active})

    @action(detail=True, methods=["get"], url_path="load_version")
    def load_version(self, request, component_id=None):
        workflow = self.get_object()
        ts = request.query_params.get("timestamp")
        if not ts:
            return Response({"error": "timestamp required"}, status=400)

        ipynb_path = Path(settings.MEDIA_ROOT) / "workflows" / str(workflow.id) / f"{workflow.id}_{ts}.ipynb"
        if not ipynb_path.exists():
            return Response({"error": "Version not found"}, status=404)

        nb = nbformat.read(ipynb_path, as_version=4)
        cells = []
        for c in nb.cells:
            if c.cell_type == "code":
                src = "".join(c.source)
                block = python_to_block(src)
                cells.append(block)

        return Response({"cells": cells})

    @action(detail=True, methods=["post"], url_path="register_version")
    def register_version(self, request, component_id=None):
        workflow = self.get_object()
        ts = request.data.get("timestamp")
        if not ts:
            return Response({"error": "timestamp required"}, status=400)

        base_dir = Path(settings.MEDIA_ROOT) / "workflows" / str(workflow.id)
        keep_py = base_dir / f"{workflow.id}_{ts}.py"
        keep_ipynb = base_dir / f"{workflow.id}_{ts}.ipynb"

        if not keep_py.exists() or not keep_ipynb.exists():
            return Response({"error": "Version not found"}, status=404)

        nb = nbformat.read(keep_ipynb, as_version=4)
        cells = []
        for c in nb.cells:
            if c.cell_type == "code":
                src = "".join(c.source)
                block = python_to_block(src)
                cells.append(block)

        workflow.cells = cells
        workflow.code_file.name = str(keep_py.relative_to(Path(settings.MEDIA_ROOT)))
        workflow.ipynb_file.name = str(keep_ipynb.relative_to(Path(settings.MEDIA_ROOT)))
        workflow.save()

        for f in base_dir.glob(f"{workflow.id}_*.*"):
            if f.stem != f"{workflow.id}_{ts}":
                try:
                    f.unlink()
                except Exception:
                    pass

        return Response({"status": "registered", "timestamp": ts, "cells": workflow.cells})

    def perform_update(self, serializer):
        workflow = serializer.save()

        code_lines = []
        nb = nbformat.v4.new_notebook()

        for cell in workflow.cells:
            src = block_to_python(cell)
            code_lines.append(src)
            nb.cells.append(nbformat.v4.new_code_cell(src))

        code_text = "\n\n".join(code_lines)

        py_path = Path(settings.MEDIA_ROOT) / workflow_version_path(workflow, "py")
        py_path.parent.mkdir(parents=True, exist_ok=True)
        py_path.write_text(code_text, encoding="utf-8")

        ipynb_path = Path(settings.MEDIA_ROOT) / workflow_version_path(workflow, "ipynb")
        with ipynb_path.open("w", encoding="utf-8") as f:
            nbformat.write(nb, f)

        workflow.code_file.name = str(py_path.relative_to(Path(settings.MEDIA_ROOT)))
        workflow.ipynb_file.name = str(ipynb_path.relative_to(Path(settings.MEDIA_ROOT)))
        workflow.save()


class WorkflowSchedulerViewSet(viewsets.ModelViewSet):
    queryset = WorkflowScheduler.objects.all()
    serializer_class = WorkflowSchedulerSerializer

    @action(detail=True, methods=["post"], url_path="run_now")
    def run_now(self, request, pk=None):
        scheduler = self.get_object()
        workflow = scheduler.workflow

        task = celery_app.send_task("worker.run_workflow", args=[workflow.id], queue="workflows")

        WorkflowRun.objects.create(
            workflow=workflow,
            task_id=task.id,
            status="QUEUED",
            started_at=timezone.now(),
        )

        return Response({"status": "QUEUED", "task_id": task.id}, status=status.HTTP_200_OK)


class WorkflowSchedulerLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WorkflowSchedulerLogSerializer

    def get_queryset(self):
        qs = WorkflowSchedulerLog.objects.all().order_by("-timestamp")
        scheduler_id = self.request.query_params.get("scheduler_id")
        if scheduler_id:
            qs = qs.filter(scheduler_id=scheduler_id)
        return qs


class WorkflowRunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = WorkflowRun.objects.all().order_by("-started_at")
    serializer_class = WorkflowRunSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        workflow_id = self.request.query_params.get("workflow_id")
        if workflow_id:
            qs = qs.filter(workflow_id=workflow_id)
        return qs


class RunWorkflowSchedulesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        results = run_due_workflow_schedules()
        return Response(results)


class WorkersStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        insp = celery_app.control.inspect()

        try:
            ping = insp.ping() or {}
        except Exception as e:
            ping = {}
            print(f"Ping error: {e}")

        workers = []
        for worker_name, reply in ping.items():
            workers.append({"worker": worker_name, "status": reply.get("ok", "offline")})

        if not workers:
            workers.append({"worker": "No workers", "status": "offline"})

        queues = {}
        tasks_preview = {}

        for queue in ["scenarios", "workflows"]:
            try:
                client = redis.Redis.from_url(settings.CELERY_BROKER_URL)
                length = client.llen(queue)
                queues[queue] = length

                tasks_preview[queue] = []
                for raw in client.lrange(queue, 0, 19):
                    try:
                        task = json.loads(raw)
                        task_id = task.get("headers", {}).get("id") or task.get("properties", {}).get("correlation_id")
                        args = task.get("headers", {}).get("argsrepr", "")
                        tasks_preview[queue].append({"task_id": task_id, "args": args})
                    except Exception as e:
                        print(f"Parse error in queue {queue}: {e}")
            except Exception as e:
                queues[queue] = None
                tasks_preview[queue] = []
                print(f"Redis error for {queue}: {e}")

        return Response({"workers": workers, "queues": queues, "tasks": tasks_preview})


class TaskManagementView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, task_id):
        queue = request.query_params.get("queue", "workflows")
        revoke_flag = request.query_params.get("revoke")

        try:
            client = redis.Redis.from_url(settings.CELERY_BROKER_URL)
        except Exception as e:
            return Response({"error": f"Redis connection failed: {e}"}, status=500)

        removed = 0
        try:
            removed = client.lrem(queue, 0, json.dumps({"headers": {"id": task_id}}))
        except Exception as e:
            print(f"Error removing task {task_id} from {queue}: {e}")

        if revoke_flag:
            try:
                celery_app.control.revoke(task_id, terminate=True, signal="SIGTERM")
            except Exception as e:
                return Response({"error": f"Failed to revoke: {e}"}, status=500)

        return Response({"queue": queue, "removed": removed, "revoked": bool(revoke_flag)})


__all__ = [
    "WorkflowViewSet",
    "WorkflowSchedulerViewSet",
    "WorkflowSchedulerLogViewSet",
    "WorkflowRunViewSet",
    "RunWorkflowSchedulesView",
    "WorkersStatusView",
    "TaskManagementView",
]
