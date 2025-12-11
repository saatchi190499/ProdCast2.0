from django.db import models

from apiapp.domains.data.models import DataSourceComponent


class VisualAnalysisConfig(models.Model):
    component = models.OneToOneField(
        DataSourceComponent,
        on_delete=models.CASCADE,
        related_name="visual_config",
    )
    charts = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "apiapp_visual_analysis_config"
        verbose_name = "Visual Analysis Config"
        verbose_name_plural = "Visual Analysis Configs"
        app_label = "apiapp"

    def __str__(self):
        return f"VisualAnalysis for {self.component.name}"


__all__ = ["VisualAnalysisConfig"]
