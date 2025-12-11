from django.db import models


class UnitSystem(models.Model):
    """Represents a system of units (e.g., Oil Field, Norwegian S.I.)."""

    unit_system_id = models.AutoField(primary_key=True)
    unit_system_name = models.CharField("Unit System Name", max_length=100, unique=True)
    created_date = models.DateTimeField(auto_now_add=True)
    modified_date = models.DateTimeField(auto_now=True)
    created_by = models.IntegerField(null=True, blank=True)
    modified_by = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "apiapp_unit_system"
        verbose_name = "Unit System"
        verbose_name_plural = "Unit Systems"
        ordering = ["unit_system_name"]
        app_label = "apiapp"

    def __str__(self):
        return self.unit_system_name


class UnitType(models.Model):
    """Defines the type of a unit (e.g., Viscosity, Acceleration)."""

    unit_type_id = models.AutoField(primary_key=True)
    unit_type_name = models.CharField("Unit Type Name", max_length=100, unique=True)
    created_date = models.DateTimeField(auto_now_add=True)
    modified_date = models.DateTimeField(auto_now=True)
    created_by = models.IntegerField(null=True, blank=True)
    modified_by = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "apiapp_unit_type"
        verbose_name = "Unit Type"
        verbose_name_plural = "Unit Types"
        ordering = ["unit_type_name"]
        app_label = "apiapp"

    def __str__(self):
        return self.unit_type_name


class UnitDefinition(models.Model):
    """
    Defines a specific unit (e.g., Feet per second squared, bar/min) and its properties.
    """

    unit_definition_id = models.AutoField(primary_key=True)
    unit_definition_name = models.CharField("Unit Definition Name", max_length=100)
    unit_type = models.ForeignKey(UnitType, on_delete=models.PROTECT, verbose_name="Unit Type")
    scale_factor = models.DecimalField("Scale Factor", max_digits=20, decimal_places=10)
    offset = models.DecimalField("Offset", max_digits=20, decimal_places=10)
    is_base = models.BooleanField("Is Base Unit", default=False)
    alias_text = models.CharField("Alias Text", max_length=50, blank=True, null=True)
    precision = models.IntegerField("Precision")
    created_date = models.DateTimeField(auto_now_add=True)
    modified_date = models.DateTimeField(auto_now=True)
    created_by = models.IntegerField(null=True, blank=True)
    modified_by = models.IntegerField(null=True, blank=True)
    calculation_method = models.IntegerField("Calculation Method", null=True, blank=True)

    class Meta:
        db_table = "apiapp_unit_definition"
        verbose_name = "Unit Definition"
        verbose_name_plural = "Unit Definitions"
        unique_together = (("unit_definition_name", "unit_type"),)
        ordering = ["unit_definition_name"]
        app_label = "apiapp"

    def __str__(self):
        return self.unit_definition_name


class UnitCategory(models.Model):
    """Categorizes units (e.g., Angle, Anisotropy)."""

    unit_category_id = models.AutoField(primary_key=True)
    unit_type = models.ForeignKey(UnitType, on_delete=models.PROTECT, verbose_name="Unit Type")
    unit_category_name = models.CharField("Unit Category Name", max_length=100)
    created_date = models.DateTimeField(auto_now_add=True)
    modified_date = models.DateTimeField(auto_now=True)
    created_by = models.IntegerField(null=True, blank=True)
    modified_by = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "apiapp_unit_category"
        verbose_name = "Unit Category"
        verbose_name_plural = "Unit Categories"
        unique_together = (("unit_category_name", "unit_type"),)
        ordering = ["unit_category_name"]
        app_label = "apiapp"

    def __str__(self):
        return f"{self.unit_category_name} ({self.unit_type.unit_type_name})"


class UnitSystemCategoryDefinition(models.Model):
    """Links a Unit System, Unit Category, and a specific Unit Definition."""

    unit_system_category_definition_id = models.AutoField(primary_key=True)
    unit_system = models.ForeignKey(UnitSystem, on_delete=models.CASCADE, verbose_name="Unit System")
    unit_category = models.ForeignKey(UnitCategory, on_delete=models.CASCADE, verbose_name="Unit Category")
    unit_definition = models.ForeignKey(UnitDefinition, on_delete=models.CASCADE, verbose_name="Unit Definition")
    created_date = models.DateTimeField(auto_now_add=True)
    modified_date = models.DateTimeField(auto_now=True)
    created_by = models.IntegerField(null=True, blank=True)
    modified_by = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "apiapp_unit_system_category_definition"
        verbose_name = "Unit System Category Definition"
        verbose_name_plural = "Unit System Category Definitions"
        unique_together = (("unit_system", "unit_category", "unit_definition"),)
        ordering = ["unit_system", "unit_category"]
        app_label = "apiapp"

    def __str__(self):
        return f"{self.unit_system.unit_system_name} - {self.unit_category.unit_category_name} uses {self.unit_definition.unit_definition_name}"


class ObjectType(models.Model):
    object_type_id = models.AutoField(primary_key=True)
    object_type_name = models.CharField("Object Type", max_length=50, unique=True)

    class Meta:
        db_table = "apiapp_object_type"
        verbose_name = "Object Type"
        verbose_name_plural = "Object Types"
        ordering = ["object_type_name"]
        app_label = "apiapp"

    def __str__(self):
        return self.object_type_name


class ObjectInstance(models.Model):
    object_instance_id = models.AutoField(primary_key=True)
    object_type = models.ForeignKey(ObjectType, on_delete=models.CASCADE, verbose_name="Object Type")
    object_instance_name = models.CharField("Object Instance", max_length=50, unique=True)

    class Meta:
        db_table = "apiapp_object_instance"
        verbose_name = "Object Instance"
        verbose_name_plural = "Object Instances"
        ordering = ["object_instance_name"]
        app_label = "apiapp"

    def __str__(self):
        return self.object_instance_name


class ObjectTypeProperty(models.Model):
    object_type_property_id = models.AutoField(primary_key=True)
    object_type = models.ForeignKey(ObjectType, on_delete=models.CASCADE, verbose_name="Object Type")
    object_type_property_name = models.CharField("Object Type Property", max_length=50)
    object_type_property_category = models.CharField("Category", max_length=50)
    openserver = models.CharField("OpenServer", max_length=100, blank=True, null=True)
    unit_category = models.ForeignKey(UnitCategory, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Unit Category")
    unit = models.ForeignKey(
        UnitDefinition,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Unit",
        editable=False,
    )

    class Meta:
        db_table = "apiapp_object_type_property"
        verbose_name = "Object Type Property"
        verbose_name_plural = "Object Type Properties"
        unique_together = (("object_type", "object_type_property_name"),)
        ordering = ["object_type_property_name"]
        app_label = "apiapp"

    def save(self, *args, **kwargs):
        if self.unit_category:
            base_unit = UnitDefinition.objects.filter(unit_type=self.unit_category.unit_type, is_base=True).first()
            self.unit = base_unit
        else:
            self.unit = None
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.object_type.object_type_name} / {self.object_type_property_name}"


class GapNetworkData(models.Model):
    # component link removed; topology is now global/base
    well_name = models.CharField(max_length=100)
    paths = models.JSONField()
    branches = models.JSONField()
    trunks = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "apiapp"


__all__ = [
    "UnitSystem",
    "UnitType",
    "UnitDefinition",
    "UnitCategory",
    "UnitSystemCategoryDefinition",
    "ObjectType",
    "ObjectInstance",
    "ObjectTypeProperty",
    "GapNetworkData",
]
