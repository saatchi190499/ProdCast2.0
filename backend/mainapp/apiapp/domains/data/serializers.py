from django.utils.timezone import now
from rest_framework import serializers

from apiapp.domains.catalog.models import ObjectInstance, ObjectType, ObjectTypeProperty
from apiapp.domains.data.models import DataSource, DataSourceComponent, MainClass


class DataSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSource
        fields = ["id", "data_source_name", "data_source_type"]


class DataSourceComponentSerializer(serializers.ModelSerializer):
    created_by = serializers.SlugRelatedField(slug_field="username", read_only=True)
    data_source = serializers.SlugRelatedField(slug_field="data_source_name", queryset=DataSource.objects.all())
    file = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = DataSourceComponent
        fields = ["id", "name", "description", "data_source", "created_by", "created_date", "last_updated", "file"]
        read_only_fields = ["created_by", "created_date", "last_updated"]


class MainClassSerializer(serializers.ModelSerializer):
    data_source = serializers.CharField(source="component.data_source.data_source_name", read_only=True)

    class Meta:
        model = MainClass
        fields = [
            "data_set_id",
            "scenario",
            "component",
            "data_source",
            "object_type",
            "object_instance",
            "object_type_property",
            "value",
            "date_time",
            "tag",
            "sub_data_source",
            "description",
        ]
        read_only_fields = ["data_set_id", "data_source"]

    def to_internal_value(self, data):
        data = data.copy()

        if isinstance(data.get("object_type"), str):
            try:
                obj = ObjectType.objects.get(object_type_name=data["object_type"])
                data["object_type"] = obj.pk
            except ObjectType.DoesNotExist:
                raise serializers.ValidationError({"object_type": "Unknown object type"})

        if isinstance(data.get("object_instance"), str):
            try:
                obj = ObjectInstance.objects.get(object_instance_name=data["object_instance"])
                data["object_instance"] = obj.pk
            except ObjectInstance.DoesNotExist:
                raise serializers.ValidationError({"object_instance": "Unknown object instance"})

        if isinstance(data.get("object_type_property"), str):
            try:
                obj = ObjectTypeProperty.objects.get(object_type_property_name=data["object_type_property"])
                data["object_type_property"] = obj.pk
            except ObjectTypeProperty.DoesNotExist:
                raise serializers.ValidationError({"object_type_property": "Unknown object type property"})

        return super().to_internal_value(data)

    def create(self, validated_data):
        if "component" not in validated_data and self.context.get("component") is not None:
            validated_data["component"] = self.context.get("component")

        if not validated_data.get("date_time"):
            validated_data["date_time"] = now()

        return super().create(validated_data)

    def update(self, instance, validated_data):
        if not validated_data.get("date_time"):
            validated_data["date_time"] = now()

        return super().update(instance, validated_data)


__all__ = [
    "DataSourceSerializer",
    "DataSourceComponentSerializer",
    "MainClassSerializer",
]
