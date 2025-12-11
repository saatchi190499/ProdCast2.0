from rest_framework import serializers

from apiapp.domains.workflow.models import (
    Workflow,
    WorkflowRun,
    WorkflowScheduler,
    WorkflowSchedulerLog,
)


class WorkflowSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workflow
        fields = "__all__"


class WorkflowListSerializer(serializers.ModelSerializer):
    component_name = serializers.CharField(source="component.name", read_only=True)

    class Meta:
        model = Workflow
        fields = [
            "id",
            "component_id",
            "component_name",
        ]


class WorkflowSchedulerSerializer(serializers.ModelSerializer):
    workflow_name = serializers.CharField(source="workflow.component.name", read_only=True)

    class Meta:
        model = WorkflowScheduler
        fields = [
            "id",
            "workflow",
            "workflow_name",
            "cron_expression",
            "next_run",
            "last_run",
            "is_active",
            "created_date",
        ]


class WorkflowSchedulerLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowSchedulerLog
        fields = ["id", "scheduler", "timestamp", "status", "message"]


class WorkflowRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowRun
        fields = [
            "id",
            "workflow",
            "scheduler",
            "task_id",
            "started_at",
            "finished_at",
            "status",
            "output",
            "error",
        ]


__all__ = [
    "WorkflowSerializer",
    "WorkflowListSerializer",
    "WorkflowSchedulerSerializer",
    "WorkflowSchedulerLogSerializer",
    "WorkflowRunSerializer",
]
