from rest_framework import serializers

from apiapp.domains.data.models import DataSourceComponent
from apiapp.domains.data.serializers import DataSourceComponentSerializer
from apiapp.domains.scenario.models import ScenarioClass, ScenarioComponentLink, ScenarioLog


class ScenarioClassSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScenarioClass
        fields = [
            "scenario_id",
            "scenario_name",
            "description",
            "status",
            "start_date",
            "end_date",
            "created_by",
            "created_date",
            "is_approved",
        ]
        read_only_fields = ["scenario_id", "created_by", "created_date"]


class ScenarioLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScenarioLog
        fields = "__all__"


class ScenarioComponentLinkSerializer(serializers.ModelSerializer):
    component_detail = DataSourceComponentSerializer(source="component", read_only=True)

    class Meta:
        model = ScenarioComponentLink
        fields = [
            "id",
            "scenario",
            "component",
            "component_detail",
        ]
        read_only_fields = ["id"]

    def validate(self, data):
        scenario = data.get("scenario")
        component = data.get("component")
        data_source = component.data_source

        if (
            ScenarioComponentLink.objects.filter(
                scenario=scenario,
                component__data_source=data_source,
            )
            .exclude(component=component)
            .exists()
        ):
            raise serializers.ValidationError(
                f"A component with data source '{data_source}' already exists in this scenario."
            )

        return data


__all__ = [
    "ScenarioClassSerializer",
    "ScenarioLogSerializer",
    "ScenarioComponentLinkSerializer",
]
