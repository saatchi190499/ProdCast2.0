# apiapp/views/workflow_scheduler_view.py
from rest_framework import viewsets
from rest_framework.permissions import IsAdminUser
from ..models import WorkflowScheduler, WorkflowSchedulerLog, WorkflowRun
from ..serializers import WorkflowSchedulerSerializer, WorkflowSchedulerLogSerializer, WorkflowRunSerializer

class WorkflowSchedulerViewSet(viewsets.ModelViewSet):
    queryset = WorkflowScheduler.objects.all().order_by("-created_date")
    serializer_class = WorkflowSchedulerSerializer
    permission_classes = [IsAdminUser]  # только админы управляют

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