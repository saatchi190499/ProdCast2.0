from rest_framework import serializers
from .models import (
    ScenarioClass,
    ServersClass,
    ScenarioComponent,
    ScenarioComponentLink,
    ObjectType,
    ObjectInstance,
    ObjectTypeProperty,
    DataSource,
    MainClass,
    ScenarioLog,
    Workflow,
    WorkflowScheduler,
    WorkflowSchedulerLog,
    WorkflowRun,
)

# ---------- Servers ----------
class ServerSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServersClass
        fields = [
            "server_id",
            "server_name",
            "server_url",
            "server_status",
            "is_active",
            "allow_scenarios",
            "allow_workflows",
            "description",
        ]


# ---------- ScenarioComponent ----------

class ScenarioComponentSerializer(serializers.ModelSerializer):
    created_by = serializers.SlugRelatedField(
        slug_field="username",
        read_only=True
    )

    data_source = serializers.SlugRelatedField(
        slug_field="data_source_name",
        queryset=DataSource.objects.all()
    )

    file = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = ScenarioComponent
        fields = ["id", "name", "description", "data_source", "created_by", "created_date", "last_updated", "file"]
        read_only_fields = ["created_by", "created_date", "last_updated"]

# ---------- ScenarioClass ----------
class ScenarioClassSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScenarioClass
        fields = [
            'scenario_id',
            'scenario_name',
            'description',
            'status',
            'start_date',
            'end_date',
            'server',
            'created_by',
            'created_date',
            'is_approved',
        ]
        read_only_fields = ['scenario_id', 'created_by', 'created_date']

class ScenarioLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScenarioLog
        fields = '__all__'

# ---------- Связь Scenario ↔ Component ----------
class ScenarioComponentLinkSerializer(serializers.ModelSerializer):
    component_detail = ScenarioComponentSerializer(source='component', read_only=True)

    class Meta:
        model = ScenarioComponentLink
        fields = [
            'id',
            'scenario',
            'component',
            'component_detail',
        ]
        read_only_fields = ['id']

    def validate(self, data):
        scenario = data.get('scenario')
        component = data.get('component')
        data_source = component.data_source

        if ScenarioComponentLink.objects.filter(
            scenario=scenario,
            component__data_source=data_source
        ).exclude(component=component).exists():
            raise serializers.ValidationError(
                f"A component with data source '{data_source}' already exists in this scenario."
            )

        return data


# ---------- ObjectType ----------
class ObjectTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ObjectType
        fields = ['object_type_id', 'object_type_name']
        read_only_fields = ['object_type_id']


# ---------- ObjectInstance ----------
class ObjectInstanceSerializer(serializers.ModelSerializer):
    object_type_name = serializers.CharField(source="object_type.object_type_name", read_only=True)

    class Meta:
        model = ObjectInstance
        fields = [
            "object_instance_id",
            "object_instance_name",
            "object_type",
            "object_type_name",
        ]


# ---------- ObjectTypeProperty ----------
class ObjectTypePropertySerializer(serializers.ModelSerializer):
    class Meta:
        model = ObjectTypeProperty
        fields = [
            'object_type_property_id',
            'object_type',
            'object_type_property_name',
            'object_type_property_category',
            'tag',
            'openserver'
        ]
        read_only_fields = ['object_type_property_id']


# ---------- DataSource ----------
class DataSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSource
        fields = ['id', 'data_source_name', 'data_source_type']



# ---------- MainClass ----------

class MainClassSerializer(serializers.ModelSerializer):
    class Meta:
        model = MainClass
        fields = [
            "data_set_id",
            "data_source_name",
            "data_source_id",
            "object_type",
            "object_instance",
            "object_type_property",
            "value",
            "date_time",
            "sub_data_source",
            "description"
        ]
        read_only_fields = ['data_set_id', 'data_source_id', 'data_source_name']

    def to_internal_value(self, data):
        data = data.copy()

        if isinstance(data.get("object_type"), str):
            try:
                obj = ObjectType.objects.get(object_type_name=data["object_type"])
                data["object_type"] = obj.pk
            except ObjectType.DoesNotExist:
                raise serializers.ValidationError({"object_type": "Такой тип объекта не найден"})

        if isinstance(data.get("object_instance"), str):
            try:
                obj = ObjectInstance.objects.get(object_instance_name=data["object_instance"])
                data["object_instance"] = obj.pk
            except ObjectInstance.DoesNotExist:
                raise serializers.ValidationError({"object_instance": "Такой объект не найден"})

        if isinstance(data.get("object_type_property"), str):
            try:
                obj = ObjectTypeProperty.objects.get(object_type_property_name=data["object_type_property"])
                data["object_type_property"] = obj.pk
            except ObjectTypeProperty.DoesNotExist:
                raise serializers.ValidationError({"object_type_property": "Такое свойство не найдено"})

        return super().to_internal_value(data)

    def create(self, validated_data):
        validated_data["data_source_id"] = self.context.get("data_source_id")
        validated_data["data_source_name"] = self.context.get("data_source_name")
        return super().create(validated_data)

# ---------- Workflow ----------
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

# apiapp/serializers/workflow_scheduler_serializer.py

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
        fields = ["id", "workflow", "scheduler", "task_id",
                  "started_at", "finished_at", "status", "output", "error"]