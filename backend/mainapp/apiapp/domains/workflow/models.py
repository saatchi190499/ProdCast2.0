import os
from django.db import models

from apiapp.domains.data.models import DataSourceComponent


def workflow_code_path(instance, filename):
    return os.path.join("workflows", f"{instance.component.id}.py")


def workflow_ipynb_path(instance, filename):
    return os.path.join("workflows", f"{instance.component.id}.ipynb")


class Workflow(models.Model):
    component = models.OneToOneField(
        DataSourceComponent,
        on_delete=models.CASCADE,
        related_name="workflow",
    )
    cells = models.JSONField(default=list, blank=True)
    code_file = models.FileField(upload_to=workflow_code_path, blank=True, null=True)
    ipynb_file = models.FileField(upload_to=workflow_ipynb_path, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "apiapp"

    def __str__(self):
        return f"Workflow for {self.component}"

    @property
    def python_code(self):
        if self.code_file and self.code_file.path:
            try:
                with open(self.code_file.path, "r", encoding="utf-8") as f:
                    return f.read()
            except FileNotFoundError:
                return ""
        return ""


class WorkflowScheduler(models.Model):
    workflow = models.ForeignKey(
        Workflow,
        on_delete=models.CASCADE,
        related_name="schedules",
    )
    cron_expression = models.CharField(
        "Cron Expression",
        max_length=100,
        help_text="E.g. '0 2 * * *' for daily at 2am",
    )
    next_run = models.DateTimeField(null=True, blank=True)
    last_run = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey("auth.User", on_delete=models.SET_NULL, null=True, blank=True)
    created_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "apiapp_workflow_scheduler"
        verbose_name = "Workflow Scheduler"
        verbose_name_plural = "Workflow Schedulers"
        app_label = "apiapp"

    def __str__(self):
        return f"Schedule for {self.workflow.component.name} ({self.cron_expression})"


class WorkflowSchedulerLog(models.Model):
    scheduler = models.ForeignKey(
        WorkflowScheduler,
        on_delete=models.CASCADE,
        related_name="logs",
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=50)
    message = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "apiapp_workflow_scheduler_log"
        verbose_name = "Workflow Scheduler Log"
        verbose_name_plural = "Workflow Scheduler Logs"
        ordering = ["-timestamp"]
        app_label = "apiapp"

    def __str__(self):
        return f"{self.scheduler.id} @ {self.timestamp} -> {self.status}"


class WorkflowRun(models.Model):
    workflow = models.ForeignKey(Workflow, on_delete=models.CASCADE, related_name="runs")
    scheduler = models.ForeignKey(
        WorkflowScheduler,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="runs",
    )
    task_id = models.CharField(max_length=255, null=True, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=50, default="QUEUED")
    output = models.TextField(blank=True, null=True)
    error = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "apiapp_workflow_run"
        ordering = ["-started_at"]
        app_label = "apiapp"

    def __str__(self):
        return f"Workflow {self.workflow_id} run @ {self.started_at} -> {self.status}"


__all__ = [
    "Workflow",
    "WorkflowScheduler",
    "WorkflowSchedulerLog",
    "WorkflowRun",
]
