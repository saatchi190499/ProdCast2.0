# apiapp/admin.py

from django.contrib import admin
from django.utils.html import format_html
from django.utils.safestring import mark_safe
from .models import (
    UnitSystem, UnitType, UnitDefinition, UnitCategory, UnitSystemCategoryDefinition,
    DataSource, DataSourceComponent, ScenarioClass, ScenarioComponentLink,
    ObjectType, ObjectInstance, ObjectTypeProperty, MainClass, MainClassHistory, ScenarioLog, Workflow, 
    WorkflowScheduler, WorkflowSchedulerLog, GapNetworkData
)


@admin.register(GapNetworkData)
class GapNetworkDataAdmin(admin.ModelAdmin):
    list_display = ("well_name", "created_at")
    search_fields = ("well_name",)
    readonly_fields = ("created_at",)
    list_filter = ("created_at",)
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
    list_display = ("data_source_name", "get_data_source_type_display")
    search_fields = ("data_source_name",)
    list_filter = ("data_source_type",)   # adds a sidebar filter


# ---------- Data Source Component ----------
@admin.register(DataSourceComponent)
class DataSourceComponentAdmin(admin.ModelAdmin):
    list_display = ('name', 'data_source', 'internal_mode', 'created_date', 'last_updated', 'created_by')
    list_filter = ('data_source', 'created_by')
    search_fields = ('name', 'description')
    readonly_fields = ('created_date', 'last_updated', 'created_by')

    fieldsets = (
        (None, {
            'fields': ('name', 'description', 'data_source', 'internal_mode', 'file')
        }),
        ('Audit Information', {
            'fields': ('created_by', 'created_date', 'last_updated'),
            'classes': ('collapse',)
        }),
    )


# ---------- Servers ----------
# Removed: ServersClass and associated admin as server registry is deprecated

# ---------- Scenario ----------
@admin.register(ScenarioClass)
class ScenarioClassAdmin(admin.ModelAdmin):
    list_display = (
        'scenario_name', 
        'status', 
        'task_id',  # добавлено
        'is_approved', 
        'start_date', 
        'end_date', 
        'created_date', 
        'created_by'
    )
    list_filter = ('status', 'is_approved', 'created_by')
    search_fields = ('scenario_name', 'description')
    readonly_fields = ('created_date', 'created_by', 'task_id')  # task_id readonly

    fieldsets = (
        (None, {
            'fields': ('scenario_name', 'description', 'status', 'task_id', 'is_approved')
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
    list_display = ('object_type', 'object_type_property_name', 'object_type_property_category', 'unit_category', 'unit')
    list_filter = ('object_type', 'object_type_property_category', 'unit_category')  # filter by category instead of unit
    search_fields = ('object_type_property_name', 'openserver')
    readonly_fields = ('unit',)  # make 'unit' read-only

    fieldsets = (
        (None, {
            'fields': ('object_type', 'object_type_property_name', 'object_type_property_category')
        }),
        ('Integration Details', {
            'fields': ( 'openserver', 'unit_category', 'unit')
        }),
    )


# ---------- Main Data ----------
@admin.register(MainClass)
class MainClassAdmin(admin.ModelAdmin):
    list_display = (
        'data_set_id', 'component', 'object_type',
        'object_instance', 'object_type_property', 'value', 'date_time', 'tag',
    )
    list_filter = (
        'component', 'component__data_source', 'object_type', 'object_instance',
        'object_type_property',  'date_time'
    )
    search_fields = (
        'data_set_id', 'description',
        'component__data_source__data_source_name', # Search through ForeignKey related names
        'object_type__object_type_name',
        'object_instance__object_instance_name',
        'object_type_property__object_type_property_name'
    )
    # The pre_save signal on the model handles the validation.

    fieldsets = (
        ('Component', {
            'fields': ('component',)
        }),
        ('Object Details', {
            'fields': ('object_type', 'object_instance', 'object_type_property')
        }),
        ('Value and Time', {
            'fields': ('value', 'date_time')
        }),
        ('Additional Information', {
            'fields': ('description', 'tag')
        }),
    )


@admin.register(MainClassHistory)
class MainClassHistoryAdmin(admin.ModelAdmin):
    list_display = ("id", "main_record", "time", "value")
    list_filter = ("time",)
    search_fields = (
        "id",
        "main_record__data_set_id",
        "main_record__component__name",
        "main_record__component__data_source__data_source_name",
        "value",
    )
    readonly_fields = ("time",)

@admin.register(Workflow)
class WorkflowAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "component",
        "updated_at",
        "code_link",
        "ipynb_link",
        "short_cells_preview",
    )
    search_fields = ("component__name",)
    readonly_fields = ("updated_at", "code_file", "ipynb_file", "preview_cells")
    fields = (
        "component",
        "updated_at",
        "inputs_config",
        "outputs_config",
        "cells",
        "preview_cells",
        "code_file",
        "ipynb_file",
    )

    # --- File download links ---
    def code_link(self, obj):
        if obj.code_file:
            return format_html(
                '<a href="{}" download class="button">📄 Download .py</a>',
                obj.code_file.url
            )
        return "—"
    code_link.short_description = "Python File"

    def ipynb_link(self, obj):
        if obj.ipynb_file:
            return format_html(
                '<a href="{}" download class="button">📘 Download .ipynb</a>',
                obj.ipynb_file.url
            )
        return "—"
    ipynb_link.short_description = "Notebook File"

    # --- Preview cells in detail page ---
   

    def preview_cells(self, obj):
        if not obj.cells:
            return "(empty)"
        html = "<ul style='margin:0;padding-left:16px;'>"
        for c in obj.cells[:5]:
            label = c.get("label") or c.get("type", "unknown").title()
            code = c.get("source") or str(c.get("metadata", ""))[:60]
            html += f"<li><b>{label}</b>: <code>{code}</code></li>"
        if len(obj.cells) > 5:
            html += f"<li>… {len(obj.cells) - 5} more cells</li>"
        html += "</ul>"
        return mark_safe(html)
    preview_cells.short_description = "Cells Preview"

    # --- Shorter preview for list view ---
    def short_cells_preview(self, obj):
        if not obj.cells:
            return "—"
        first = obj.cells[0]
        label = first.get("label") or first.get("type", "unknown").title()
        code = first.get("source") or str(first.get("metadata", ""))[:30]
        return f"{label}: {code}"
    short_cells_preview.short_description = "First Cell"

@admin.register(WorkflowScheduler)
class WorkflowSchedulerAdmin(admin.ModelAdmin):
    list_display = ("id", "workflow", "cron_expression", "is_active", "last_run", "next_run")

@admin.register(WorkflowSchedulerLog)
class WorkflowSchedulerLogAdmin(admin.ModelAdmin):
    list_display = ("scheduler", "timestamp", "status", "message")
    list_filter = ("status", "timestamp")

