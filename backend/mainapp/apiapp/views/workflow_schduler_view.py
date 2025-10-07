# apiapp/views/workflow_scheduler_view.py
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from rest_framework.decorators import action
from mainapp.celery import app
from rest_framework import viewsets
from rest_framework.permissions import IsAdminUser
from ..models import WorkflowScheduler, WorkflowSchedulerLog, WorkflowRun
from ..serializers import WorkflowSchedulerSerializer, WorkflowSchedulerLogSerializer, WorkflowRunSerializer

class WorkflowSchedulerViewSet(viewsets.ModelViewSet):
    queryset = WorkflowScheduler.objects.all()
    serializer_class = WorkflowSchedulerSerializer

    @action(detail=True, methods=["post"], url_path="run_now")
    def run_now(self, request, pk=None):
        scheduler = self.get_object()
        workflow = scheduler.workflow

        task = app.send_task("worker.run_workflow", args=[workflow.id], queue="workflows")

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