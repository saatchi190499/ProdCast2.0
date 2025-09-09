# apiapp/admin.py

from django.contrib import admin
from django.contrib.auth.models import User
from .models import (
    UnitSystem, UnitType, UnitDefinition, UnitCategory, UnitSystemCategoryDefinition,
    DataSource, ScenarioComponent, ServersClass, ScenarioClass, ScenarioComponentLink,
    ObjectType, ObjectInstance, ObjectTypeProperty, MainClass, ScenarioLog
)

# --- New Unit System Models ---

@admin.register(UnitSystem)
class UnitSystemAdmin(admin.ModelAdmin):
    list_display = ('unit_system_name', 'created_date', 'modified_date', 'created_by', 'modified_by')
    search_fields = ('unit_system_name',)
    readonly_fields = ('created_date', 'modified_date', 'created_by', 'modified_by')

@admin.register(UnitType)
class UnitTypeAdmin(admin.ModelAdmin):
    list_display = ('unit_type_name', 'created_date', 'modified_date', 'created_by', 'modified_by')
    search_fields = ('unit_type_name',)
    readonly_fields = ('created_date', 'modified_date', 'created_by', 'modified_by')

@admin.register(UnitDefinition)
class UnitDefinitionAdmin(admin.ModelAdmin):
    list_display = ('unit_definition_name', 'unit_type', 'scale_factor', 'offset', 'is_base', 'precision')
    list_filter = ('unit_type', 'is_base')
    search_fields = ('unit_definition_name', 'alias_text')
    readonly_fields = ('created_date', 'modified_date', 'created_by', 'modified_by')
    # Using fieldsets to group related fields
    fieldsets = (
        (None, {
            'fields': ('unit_definition_name', 'unit_type', 'scale_factor', 'offset', 'is_base', 'alias_text')
        }),
        ('Details', {
            'fields': ('precision', 'calculation_method')
        }),
        ('Audit Info', {
            'fields': ('created_date', 'modified_date', 'created_by', 'modified_by'),
            'classes': ('collapse',) # Makes this section collapsible
        }),
    )

@admin.register(UnitCategory)
class UnitCategoryAdmin(admin.ModelAdmin):
    list_display = ('unit_category_name', 'unit_type', 'created_date', 'modified_date')
    list_filter = ('unit_type',)
    search_fields = ('unit_category_name',)
    readonly_fields = ('created_date', 'modified_date', 'created_by', 'modified_by')

@admin.register(UnitSystemCategoryDefinition)
class UnitSystemCategoryDefinitionAdmin(admin.ModelAdmin):
    list_display = ('unit_system', 'unit_category', 'unit_definition', 'created_date', 'modified_date')
    list_filter = ('unit_system', 'unit_category', 'unit_definition')
    search_fields = (
        'unit_system__unit_system_name',
        'unit_category__unit_category_name',
        'unit_definition__unit_definition_name'
    )
    readonly_fields = ('created_date', 'modified_date', 'created_by', 'modified_by')

# ---------- Data Source ----------
@admin.register(DataSource)
class DataSourceAdmin(admin.ModelAdmin):
    list_display = ('data_source_name',)
    search_fields = ('data_source_name',)

# ---------- Scenario Component (универсальный) ----------
@admin.register(ScenarioComponent)
class ScenarioComponentAdmin(admin.ModelAdmin):
    list_display = ('name', 'data_source', 'created_date', 'last_updated', 'created_by')
    list_filter = ('data_source', 'created_by')
    search_fields = ('name', 'description')
    readonly_fields = ('created_date', 'last_updated', 'created_by')

    fieldsets = (
        (None, {
            'fields': ('name', 'description', 'data_source', 'file')
        }),
        ('Audit Information', {
            'fields': ('created_by', 'created_date', 'last_updated'),
            'classes': ('collapse',)
        }),
    )


# ---------- Servers ----------
@admin.register(ServersClass)
class ServersClassAdmin(admin.ModelAdmin):
    # Using 'all_objects' manager to show all servers (active and inactive) in admin
    # To use this, you'd typically override get_queryset or define a custom filter.
    # For a basic display, 'objects' (ActiveManager) is default, so it shows only active.
    # If you want to see all, you can explicitly use:
    # def get_queryset(self, request):
    #     return self.model.all_objects.get_queryset()
    list_display = ('server_name', 'server_url', 'server_status', 'is_active', 'created_date', 'created_by')
    list_filter = ('is_active', 'server_status', 'created_by')
    search_fields = ('server_name', 'server_url', 'description')
    readonly_fields = ('created_date', 'created_by') # created_by is a ForeignKey to User

    actions = ['make_inactive', 'make_active']

    @admin.action(description='Mark selected servers as inactive')
    def make_inactive(self, request, queryset):
        queryset.update(is_active=False)

    @admin.action(description='Mark selected servers as active')
    def make_active(self, request, queryset):
        queryset.update(is_active=True)

# ---------- Scenario ----------
@admin.register(ScenarioClass)
class ScenarioClassAdmin(admin.ModelAdmin):
    list_display = (
        'scenario_name', 
        'status', 
        'server', 
        'task_id',  # добавлено
        'is_approved', 
        'start_date', 
        'end_date', 
        'created_date', 
        'created_by'
    )
    list_filter = ('status', 'server', 'is_approved', 'created_by')
    search_fields = ('scenario_name', 'description')
    readonly_fields = ('created_date', 'created_by', 'task_id')  # task_id readonly

    fieldsets = (
        (None, {
            'fields': ('scenario_name', 'description', 'status', 'task_id', 'server', 'is_approved')
        }),
        ('Date Range', {
            'fields': ('start_date', 'end_date')
        }),
        ('Audit Information', {
            'fields': ('created_by', 'created_date'),
            'classes': ('collapse',)
        }),
    )


@admin.register(ScenarioLog)
class ScenarioLogAdmin(admin.ModelAdmin):
    list_display = ("id", "scenario", "timestamp", "progress", "message")
    list_filter = ("scenario", "timestamp", "progress")
    search_fields = ("scenario__scenario_name", "message")
    ordering = ("-timestamp",)
    readonly_fields = ("timestamp",)

# ---------- Scenario ↔ Component Link ----------
@admin.register(ScenarioComponentLink)
class ScenarioComponentLinkAdmin(admin.ModelAdmin):
    list_display = ('scenario', 'component',)
    list_filter = ('scenario', 'component__data_source') # Filter by scenario and component's data source
    search_fields = (
        'scenario__scenario_name',
        'component__name',
        'component__data_source__data_source_name'
    )
    # The clean method on the model will handle validation, Django admin calls it on save.


# ---------- Object Models ----------
@admin.register(ObjectType)
class ObjectTypeAdmin(admin.ModelAdmin):
    list_display = ('object_type_name',)
    search_fields = ('object_type_name',)

@admin.register(ObjectInstance)
class ObjectInstanceAdmin(admin.ModelAdmin):
    list_display = ('object_instance_name', 'object_type')
    list_filter = ('object_type',)
    search_fields = ('object_instance_name',)

@admin.register(ObjectTypeProperty)
class ObjectTypePropertyAdmin(admin.ModelAdmin):
    list_display = ('object_type', 'object_type_property_name', 'object_type_property_category', 'tag', 'unit_category', 'unit')
    list_filter = ('object_type', 'object_type_property_category', 'unit_category')  # filter by category instead of unit
    search_fields = ('object_type_property_name', 'tag', 'openserver')
    readonly_fields = ('unit',)  # make 'unit' read-only

    fieldsets = (
        (None, {
            'fields': ('object_type', 'object_type_property_name', 'object_type_property_category')
        }),
        ('Integration Details', {
            'fields': ('tag', 'openserver', 'unit_category', 'unit')
        }),
    )


# ---------- Main Data ----------
@admin.register(MainClass)
class MainClassAdmin(admin.ModelAdmin):
    list_display = (
        'data_set_id', 'data_source_name', 'data_source_id', 'object_type',
        'object_instance', 'object_type_property', 'value', 'date_time',
    )
    list_filter = (
        'data_source_name', 'object_type', 'object_instance',
        'object_type_property',  'date_time'
    )
    search_fields = (
        'data_set_id', 'data_source_id', 'description',
        'data_source_name__data_source_name', # Search through ForeignKey related names
        'object_type__object_type_name',
        'object_instance__object_instance_name',
        'object_type_property__object_type_property_name'
    )
    # The pre_save signal on the model handles the validation.

    fieldsets = (
        ('Data Source Information', {
            'fields': ('data_source_name', 'data_source_id')
        }),
        ('Object Details', {
            'fields': ('object_type', 'object_instance', 'object_type_property')
        }),
        ('Value and Time', {
            'fields': ('value', 'date_time')
        }),
        ('Additional Information', {
            'fields': ('description',)
        }),
    )
