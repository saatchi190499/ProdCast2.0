from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import pre_save
from django.dispatch import receiver
from django.core.exceptions import ValidationError
from django.utils import timezone
import os
from smart_selects.db_fields import ChainedForeignKey
# --- New Unit System Models ---

class UnitSystem(models.Model):
    """
    Represents a system of units (e.g., Oil Field, Norwegian S.I.).
    Corresponds to 'UnitSystem.xlsx - Лист1.csv'.
    """
    unit_system_id = models.AutoField(primary_key=True)
    unit_system_name = models.CharField("Unit System Name", max_length=100, unique=True)
    created_date = models.DateTimeField(auto_now_add=True)
    modified_date = models.DateTimeField(auto_now=True) # Use auto_now for automatic update on save
    created_by = models.IntegerField(null=True, blank=True) # Assuming -1 means no user, so IntegerField
    modified_by = models.IntegerField(null=True, blank=True) # Same as above

    def __str__(self):
        return self.unit_system_name

    class Meta:
        db_table = 'apiapp_unit_system'
        verbose_name = "Unit System"
        verbose_name_plural = "Unit Systems"
        ordering = ["unit_system_name"]


class UnitType(models.Model):
    """
    Defines the type of a unit (e.g., Viscosity, Acceleration).
    Corresponds to 'UnitType.xlsx - Лиst1.csv'.
    """
    unit_type_id = models.AutoField(primary_key=True)
    unit_type_name = models.CharField("Unit Type Name", max_length=100, unique=True)
    created_date = models.DateTimeField(auto_now_add=True)
    modified_date = models.DateTimeField(auto_now=True)
    created_by = models.IntegerField(null=True, blank=True)
    modified_by = models.IntegerField(null=True, blank=True)

    def __str__(self):
        return self.unit_type_name

    class Meta:
        db_table = 'apiapp_unit_type'
        verbose_name = "Unit Type"
        verbose_name_plural = "Unit Types"
        ordering = ["unit_type_name"]


class UnitDefinition(models.Model):
    """
    Defines a specific unit (e.g., Feet per second squared, bar/min) and its properties.
    Corresponds to 'UnitDefinition.xlsx - Лист1.csv'.
    """
    unit_definition_id = models.AutoField(primary_key=True)
    unit_definition_name = models.CharField("Unit Definition Name", max_length=100)
    unit_type = models.ForeignKey(UnitType, on_delete=models.PROTECT, verbose_name="Unit Type") # PROTECT to prevent deletion of UnitType if definitions exist
    scale_factor = models.DecimalField("Scale Factor", max_digits=20, decimal_places=10) # Adjust max_digits/decimal_places as needed
    offset = models.DecimalField("Offset", max_digits=20, decimal_places=10)
    is_base = models.BooleanField("Is Base Unit", default=False)
    alias_text = models.CharField("Alias Text", max_length=50, blank=True, null=True)
    precision = models.IntegerField("Precision")
    created_date = models.DateTimeField(auto_now_add=True)
    modified_date = models.DateTimeField(auto_now=True)
    created_by = models.IntegerField(null=True, blank=True)
    modified_by = models.IntegerField(null=True, blank=True)
    calculation_method = models.IntegerField("Calculation Method", null=True, blank=True) # Assuming IntegerField, could be ForeignKey to another model

    def __str__(self):
        return self.unit_definition_name

    class Meta:
        db_table = 'apiapp_unit_definition'
        verbose_name = "Unit Definition"
        verbose_name_plural = "Unit Definitions"
        unique_together = (("unit_definition_name", "unit_type"),) # Name might not be unique globally, but unique within a type
        ordering = ["unit_definition_name"]


class UnitCategory(models.Model):
    """
    Categorizes units (e.g., Angle, Anisotropy).
    Corresponds to 'UnitCategory.xlsx - Лист1.csv'.
    """
    unit_category_id = models.AutoField(primary_key=True)
    unit_type = models.ForeignKey(UnitType, on_delete=models.PROTECT, verbose_name="Unit Type")
    unit_category_name = models.CharField("Unit Category Name", max_length=100)
    created_date = models.DateTimeField(auto_now_add=True)
    modified_date = models.DateTimeField(auto_now=True)
    created_by = models.IntegerField(null=True, blank=True)
    modified_by = models.IntegerField(null=True, blank=True)

    def __str__(self):
        return f"{self.unit_category_name} ({self.unit_type.unit_type_name})"

    class Meta:
        db_table = 'apiapp_unit_category'
        verbose_name = "Unit Category"
        verbose_name_plural = "Unit Categories"
        unique_together = (("unit_category_name", "unit_type"),) # Category name might be unique within a type
        ordering = ["unit_category_name"]


class UnitSystemCategoryDefinition(models.Model):
    """
    Links a Unit System, Unit Category, and a specific Unit Definition.
    Corresponds to 'UnitSystemCategoryDefinition.xlsx - Лист1.csv'.
    """
    unit_system_category_definition_id = models.AutoField(primary_key=True)
    unit_system = models.ForeignKey(UnitSystem, on_delete=models.CASCADE, verbose_name="Unit System")
    unit_category = models.ForeignKey(UnitCategory, on_delete=models.CASCADE, verbose_name="Unit Category")
    unit_definition = models.ForeignKey(UnitDefinition, on_delete=models.CASCADE, verbose_name="Unit Definition")
    created_date = models.DateTimeField(auto_now_add=True)
    modified_date = models.DateTimeField(auto_now=True)
    created_by = models.IntegerField(null=True, blank=True)
    modified_by = models.IntegerField(null=True, blank=True)

    def __str__(self):
        return f"{self.unit_system.unit_system_name} - {self.unit_category.unit_category_name} uses {self.unit_definition.unit_definition_name}"

    class Meta:
        db_table = 'apiapp_unit_system_category_definition'
        verbose_name = "Unit System Category Definition"
        verbose_name_plural = "Unit System Category Definitions"
        unique_together = (("unit_system", "unit_category", "unit_definition"),) # Prevent exact duplicates
        ordering = ["unit_system", "unit_category"]


# ---------- Data Source ----------
class DataSource(models.Model):
    DATA_SOURCE_TYPES = [
        ("INPUT", "Input"),
        ("OUTPUT", "Output"),
        ("PROCESS", "Process"),
    ]

    data_source_name = models.CharField("Data Source", max_length=50, unique=True)
    data_source_type = models.CharField(
        "Data Source Type",
        max_length=20,
        choices=DATA_SOURCE_TYPES,
        default="INPUT",
    )

    def __str__(self):
        return f"{self.data_source_name} ({self.get_data_source_type_display()})"

    class Meta:
        db_table = 'apiapp_data_source'
        verbose_name = "Data Source"
        verbose_name_plural = "Data Sources"


# ---------- Scenario Component (универсальный) ----------
class ScenarioComponent(models.Model):
    name = models.CharField("Name", max_length=100, unique=True)
    description = models.TextField("Description", blank=True)
    data_source = models.ForeignKey(DataSource, on_delete=models.PROTECT, verbose_name="Data Source")

    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_date = models.DateTimeField(auto_now_add=True)
    last_updated = models.DateTimeField(null=True, blank=True)
    file = models.FileField(upload_to='models_files/', null=True, blank=True)

    def __str__(self):
        return f"{self.name} ({self.data_source})"

    class Meta:
        db_table = 'apiapp_scenario_component'
        verbose_name = "Scenario Component"
        verbose_name_plural = "Scenario Components"
        ordering = ["-created_date"]


# ---------- Servers ----------
class ActiveManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(is_active=True)

class ServersClass(models.Model):
    server_id = models.AutoField(primary_key=True)
    server_name = models.CharField(max_length=50, unique=True)
    server_url = models.CharField(max_length=250, unique=True)
    server_status = models.CharField(max_length=50)
    description = models.TextField("Description", blank=True)

    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_servers")
    created_date = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    objects = ActiveManager()
    all_objects = models.Manager()

    def __str__(self):
        return self.server_name

    def deactivate(self):
        self.is_active = False
        self.save()

    def activate(self):
        self.is_active = True
        self.save()

    class Meta:
        db_table = 'apiapp_servers'
        verbose_name = "Server"
        verbose_name_plural = "Servers"
        ordering = ["-created_date"]


# ---------- Scenario ----------
class ScenarioClass(models.Model):
    scenario_id = models.AutoField(primary_key=True)
    scenario_name = models.CharField("Scenario", max_length=50, unique=True)

    description = models.TextField("Description", blank=True)
    status = models.CharField(max_length=50)

    start_date = models.DateTimeField(null=True, blank=True)
    end_date = models.DateTimeField(null=True, blank=True)

    task_id = models.CharField(max_length=255, blank=True, null=True)
    server = models.ForeignKey(ServersClass, on_delete=models.SET_NULL, null=True, verbose_name="Server")
    is_approved = models.BooleanField(default=False)

    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="scenarios")
    created_date = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.scenario_name

    class Meta:
        db_table = 'apiapp_scenarios'
        verbose_name = "Scenario"
        verbose_name_plural = "Scenarios" # Corrected from verbose_plural
        ordering = ["-created_date"]

class ScenarioLog(models.Model):
    scenario = models.ForeignKey("ScenarioClass", on_delete=models.CASCADE, related_name="logs")
    timestamp = models.DateTimeField(default=timezone.now)
    message = models.TextField()
    progress = models.IntegerField(default=0)  # % прогресса
    
    class Meta:
        db_table = 'apiapp_scenariolog'
        verbose_name = "ScenarioLog"
        verbose_name_plural = "ScenarioLogs"

# ---------- Scenario ↔ Component Link ----------
class ScenarioComponentLink(models.Model):
    scenario = models.ForeignKey('ScenarioClass', on_delete=models.CASCADE, verbose_name="Scenario")
    component = models.ForeignKey('ScenarioComponent', on_delete=models.CASCADE, verbose_name="Component")

    class Meta:
        db_table = 'apiapp_scenario_component_link'
        unique_together = (("scenario", "component"),)  # ← защита от точных дублей
        verbose_name = "Scenario Component Link"
        verbose_name_plural = "Scenario Component Links"

    def __str__(self):
        return f"{self.scenario} ↔ {self.component} ({self.component.data_source})"

    def clean(self):
        # Проверка: есть ли уже другой компонент с этим data_source в этом сценарии
        exists = ScenarioComponentLink.objects.filter(
            scenario=self.scenario,
            component__data_source=self.component.data_source
        ).exclude(pk=self.pk).exists()

        if exists:
            raise ValidationError(
                f"A component with data source '{self.component.data_source}' "
                f"already exists for scenario '{self.scenario}'."
            )

    def save(self, *args, **kwargs):
        self.full_clean()  # запускаем clean() при сохранении
        super().save(*args, **kwargs)


# ---------- Object Models ----------
class ObjectType(models.Model):
    object_type_id = models.AutoField(primary_key=True)
    object_type_name = models.CharField("Object Type", max_length=50, unique=True)

    def __str__(self):
        return self.object_type_name

    class Meta:
        db_table = 'apiapp_object_type'
        verbose_name = "Object Type"
        verbose_name_plural = "Object Types"
        ordering = ["object_type_name"] # Changed to name for better ordering


class ObjectInstance(models.Model):
    object_instance_id = models.AutoField(primary_key=True)
    object_type = models.ForeignKey(ObjectType, on_delete=models.CASCADE, verbose_name="Object Type")
    object_instance_name = models.CharField("Object Instance", max_length=50, unique=True)

    def __str__(self):
        return self.object_instance_name

    class Meta:
        db_table = 'apiapp_object_instance'
        verbose_name = "Object Instance"
        verbose_name_plural = "Object Instances"
        ordering = ["object_instance_name"] # Changed to name for better ordering


class ObjectTypeProperty(models.Model):
    object_type_property_id = models.AutoField(primary_key=True)
    object_type = models.ForeignKey(ObjectType, on_delete=models.CASCADE, verbose_name="Object Type")
    object_type_property_name = models.CharField("Object Type Property", max_length=50)
    object_type_property_category = models.CharField("Category", max_length=50)
    openserver = models.CharField("OpenServer", max_length=100, blank=True, null=True)
    
    unit_category = models.ForeignKey(UnitCategory, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Unit Category")
    unit = models.ForeignKey(UnitDefinition, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Unit", editable=False)  # auto-set

    def save(self, *args, **kwargs):
        if self.unit_category:
            # find the base unit for this category
            base_unit = UnitDefinition.objects.filter(
                unit_type=self.unit_category.unit_type,
                is_base=True
            ).first()
            self.unit = base_unit
        else:
            self.unit = None
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.object_type.object_type_name} / {self.object_type_property_name}"

    class Meta:
        db_table = 'apiapp_object_type_property'
        verbose_name = "Object Type Property"
        verbose_name_plural = "Object Type Properties"
        unique_together = (("object_type", "object_type_property_name"),)
        ordering = ["object_type_property_name"]

# ---------- Main Data ----------
class MainClass(models.Model):
    data_set_id = models.AutoField(primary_key=True, unique=True)
    data_source_name = models.ForeignKey(DataSource, on_delete=models.PROTECT, verbose_name="Data Source")
    data_source_id = models.IntegerField()
    object_type = models.ForeignKey(ObjectType, on_delete=models.CASCADE, verbose_name="Object Type")
    object_instance = models.ForeignKey(ObjectInstance, on_delete=models.CASCADE, verbose_name="Object Instance")
    object_type_property = ChainedForeignKey(
        ObjectTypeProperty,
        chained_field="object_type",              # на какое поле смотрим
        chained_model_field="object_type",        # с каким полем в ObjectTypeProperty связываем
        show_all=False,
        auto_choose=True,
        sort=True,
        on_delete=models.CASCADE,
        verbose_name="Object Type Property"
    )

    value = models.DecimalField(max_digits=38, decimal_places=28, db_column='value', null=True)
    date_time = models.DateTimeField("Date", db_column='date', null=True)
    # ⬇️ УДАЛЕНО: sub_data_source = models.CharField(...)
    tag = models.CharField("Tag", max_length=100, blank=True, null=True)
    description = models.TextField("Description", null=True, blank=True)

    @property
    def sub_data_source(self) -> str | None:
        """Вычисляется из связанного ObjectTypeProperty.object_type_property_category"""
        otp = self.object_type_property
        return otp.object_type_property_category if otp else None

    def to_dict(self):
        return {
            "data_source_id": self.data_source_id,
            "object_instance_id": self.object_instance_id,
            "date_time": self.date_time.isoformat() if self.date_time else None,
            "object_type_id": self.object_type_id,
            "object_type_property_id": self.object_type_property_id,
            "data_source_name": str(self.data_source_name),
            "sub_data_source": self.sub_data_source,  # ⬅️ Добавили в вывод
        }

    class Meta:
        db_table = "apiapp_mainclass"
        verbose_name = "Main Data Record"
        verbose_name_plural = "Main Data Records"
        ordering = ["-data_source_id", "data_source_name"]
        indexes = [
            models.Index(fields=["data_source_name", "data_source_id"]),
            models.Index(fields=["object_type", "object_type_property"]),
        ]


# ---------- Validation ----------
@receiver(pre_save, sender=MainClass)
def validate_object_instance(sender, instance, **kwargs):
    if instance.object_instance.object_type != instance.object_type:
        raise ValidationError("Object instance must belong to the selected object type.")
    

# ---------- Workflow ----------
def workflow_code_path(instance, filename):
    # Save file as media/workflows/{component_id}.py
    return os.path.join("workflows", f"{instance.component.id}.py")

class Workflow(models.Model):
    component = models.OneToOneField(
        "ScenarioComponent",
        on_delete=models.CASCADE,
        related_name="workflow"
    )
    nodes = models.JSONField(default=list, blank=True)
    edges = models.JSONField(default=list, blank=True)
    code_file = models.FileField(
        upload_to=workflow_code_path,
        blank=True,
        null=True
    )
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def python_code(self):
        """
        Convenience property to read file content.
        """
        if self.code_file and self.code_file.path:
            try:
                with open(self.code_file.path, "r", encoding="utf-8") as f:
                    return f.read()
            except FileNotFoundError:
                return ""
        return ""