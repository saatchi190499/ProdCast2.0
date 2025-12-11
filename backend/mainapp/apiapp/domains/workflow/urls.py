from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apiapp.domains.workflow.views import (
    RunWorkflowSchedulesView,
    TaskManagementView,
    WorkersStatusView,
    WorkflowRunViewSet,
    WorkflowSchedulerLogViewSet,
    WorkflowSchedulerViewSet,
    WorkflowViewSet,
)

router = DefaultRouter()
router.register(r"components/workflows", WorkflowViewSet, basename="workflow")
router.register(r"workflow-schedulers", WorkflowSchedulerViewSet, basename="workflow-schedulers")
router.register(r"workflow-scheduler-logs", WorkflowSchedulerLogViewSet, basename="workflow-scheduler-logs")
router.register(r"workflow-runs", WorkflowRunViewSet, basename="workflow-runs")

urlpatterns = [
    path("", include(router.urls)),
    path("workflows/run-schedules/", RunWorkflowSchedulesView.as_view(), name="workflow-run-schedules"),
    path("workflows/workers-status/", WorkersStatusView.as_view(), name="workflow-workers-status"),
    path("workflows/task/<str:task_id>/", TaskManagementView.as_view(), name="workflow-task"),
    path("workers/schedule/", WorkersStatusView.as_view(), name="workers-schedule"),
]

__all__ = ["urlpatterns", "router"]
