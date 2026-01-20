from django.db import models
from django.db.models.signals import post_save, pre_save
from django.utils.timezone import now
from django.core.exceptions import ValidationError
from django.dispatch import receiver
from smart_selects.db_fields import ChainedForeignKey

from apiapp.domains.catalog.models import ObjectType, ObjectInstance, ObjectTypeProperty


class DataSource(models.Model):
    DATA_SOURCE_TYPES = [
        ("SOURCE", "Source"),
        ("FORECAST", "Forecast"),
        ("WORKFLOW", "Workflow"),
        ("VISUAL", "Visual"),
    ]

    data_source_name = models.CharField("Data Source", max_length=50, unique=True)
    data_source_type = models.CharField(
        "Data Source Type",
        max_length=20,
        choices=DATA_SOURCE_TYPES,
        default="SOURCE",
    )

    class Meta:
        db_table = "apiapp_data_source"
        verbose_name = "Data Source"
        verbose_name_plural = "Data Sources"
        app_label = "apiapp"

    def __str__(self):
        return f"{self.data_source_name} ({self.get_data_source_type_display()})"


class DataSourceComponent(models.Model):
    name = models.CharField("Name", max_length=100, unique=True)
    description = models.TextField("Description", blank=True)
    data_source = models.ForeignKey(DataSource, on_delete=models.PROTECT, verbose_name="Data Source")
    internal_mode = models.CharField(
        "Internal Mode",
        max_length=20,
        choices=[("SERIES", "Series"), ("CONSTANTS", "Constants")],
        default="SERIES",
    )

    created_by = models.ForeignKey("auth.User", on_delete=models.SET_NULL, null=True, blank=True)
    created_date = models.DateTimeField(auto_now_add=True)
    last_updated = models.DateTimeField(null=True, blank=True)
    file = models.FileField(upload_to="models_files/", null=True, blank=True)

    class Meta:
        db_table = "apiapp_data_source_component"
        verbose_name = "Data Source Component"
        verbose_name_plural = "Data Source Components"
        ordering = ["-created_date"]
        app_label = "apiapp"

    def __str__(self):
        return f"{self.name} ({self.data_source})"


class MainClass(models.Model):
    data_set_id = models.AutoField(primary_key=True, unique=True)
    scenario = models.ForeignKey(
        "apiapp.ScenarioClass",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="main_records",
        verbose_name="Scenario",
    )
    component = models.ForeignKey(
        DataSourceComponent,
        on_delete=models.CASCADE,
        verbose_name="Component",
        null=True,
        blank=True,
    )
    object_type = models.ForeignKey(ObjectType, on_delete=models.CASCADE, verbose_name="Object Type")
    object_instance = models.ForeignKey(ObjectInstance, on_delete=models.CASCADE, verbose_name="Object Instance")
    object_type_property = ChainedForeignKey(
        ObjectTypeProperty,
        chained_field="object_type",
        chained_model_field="object_type",
        show_all=False,
        auto_choose=True,
        sort=True,
        on_delete=models.CASCADE,
        verbose_name="Object Type Property",
    )

    value = models.TextField(db_column="value", null=True, blank=True)
    date_time = models.DateTimeField("Date", db_column="date", null=True)
    tag = models.CharField("Tag", max_length=100, blank=True, null=True)
    description = models.TextField("Description", null=True, blank=True)

    class Meta:
        db_table = "apiapp_mainclass"
        verbose_name = "Main Data Record"
        verbose_name_plural = "Main Data Records"
        ordering = ["component"]
        app_label = "apiapp"
        indexes = [
            models.Index(fields=["scenario"]),
            models.Index(fields=["component"]),
            models.Index(fields=["object_type", "object_type_property"]),
        ]

    @property
    def sub_data_source(self) -> str | None:
        otp = self.object_type_property
        return otp.object_type_property_category if otp else None

    @property
    def data_source(self):
        return self.component.data_source if self.component else None

    def to_dict(self):
        return {
            "data_source": str(self.data_source),
            "object_instance_id": self.object_instance_id,
            "date_time": self.date_time.isoformat() if self.date_time else None,
            "object_type_id": self.object_type_id,
            "object_type_property_id": self.object_type_property_id,
            "sub_data_source": self.sub_data_source,
        }


class MainClassHistory(models.Model):
    id = models.BigAutoField(primary_key=True)
    main_record = models.ForeignKey(
        MainClass,
        on_delete=models.CASCADE,
        related_name="history",
        db_index=True,
    )
    time = models.DateTimeField("Time", db_index=True)
    value = models.TextField(db_column="value", null=True, blank=True)

    class Meta:
        db_table = "apiapp_mainclass_history"
        verbose_name = "Main Data Record History"
        verbose_name_plural = "Main Data Record History"
        app_label = "apiapp"
        ordering = ["-time"]
        indexes = [
            models.Index(fields=["main_record", "time"]),
        ]

    def __str__(self):
        return f"History({self.main_record_id}) @ {self.time}"


@receiver(pre_save, sender=MainClass)
def validate_object_instance(sender, instance, **kwargs):
    if instance.object_instance.object_type != instance.object_type:
        raise ValidationError("Object instance must belong to the selected object type.")


@receiver(post_save, sender=MainClass)
def create_history_snapshot(sender, instance, created, **kwargs):
    history_time = instance.date_time or now()
    last = (
        MainClassHistory.objects.filter(main_record=instance)
        .order_by("-time", "-id")
        .first()
    )
    if last and last.time == history_time and last.value == instance.value:
        return
    MainClassHistory.objects.create(main_record=instance, time=history_time, value=instance.value)


__all__ = ["DataSource", "DataSourceComponent", "MainClass", "MainClassHistory"]
