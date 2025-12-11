from django.db import models
from django.core.exceptions import ValidationError

from apiapp.domains.data.models import DataSourceComponent


class ScenarioClass(models.Model):
    scenario_id = models.AutoField(primary_key=True)
    scenario_name = models.CharField("Scenario", max_length=50, unique=True)
    description = models.TextField("Description", blank=True)
    status = models.CharField(max_length=50)
    start_date = models.DateTimeField(null=True, blank=True)
    end_date = models.DateTimeField(null=True, blank=True)
    task_id = models.CharField(max_length=255, blank=True, null=True)
    is_approved = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="scenarios",
    )
    created_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "apiapp_scenarios"
        verbose_name = "Scenario"
        verbose_name_plural = "Scenarios"
        ordering = ["-created_date"]
        app_label = "apiapp"

    def __str__(self):
        return self.scenario_name


class ScenarioLog(models.Model):
    scenario = models.ForeignKey("ScenarioClass", on_delete=models.CASCADE, related_name="logs")
    timestamp = models.DateTimeField(auto_now_add=True)
    message = models.TextField()
    progress = models.IntegerField(default=0)

    class Meta:
        db_table = "apiapp_scenariolog"
        verbose_name = "ScenarioLog"
        verbose_name_plural = "ScenarioLogs"
        app_label = "apiapp"


class ScenarioComponentLink(models.Model):
    scenario = models.ForeignKey("ScenarioClass", on_delete=models.CASCADE, verbose_name="Scenario")
    component = models.ForeignKey(DataSourceComponent, on_delete=models.CASCADE, verbose_name="Component")

    class Meta:
        db_table = "apiapp_scenario_component_link"
        unique_together = (("scenario", "component"),)
        verbose_name = "Scenario Component Link"
        verbose_name_plural = "Scenario Component Links"
        app_label = "apiapp"

    def __str__(self):
        return f"{self.scenario} -> {self.component} ({self.component.data_source})"

    def clean(self):
        exists = (
            ScenarioComponentLink.objects.filter(
                scenario=self.scenario,
                component__data_source=self.component.data_source,
            )
            .exclude(pk=self.pk)
            .exists()
        )
        if exists:
            raise ValidationError(
                f"A component with data source '{self.component.data_source}' already exists for scenario '{self.scenario}'."
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


__all__ = ["ScenarioClass", "ScenarioLog", "ScenarioComponentLink"]
