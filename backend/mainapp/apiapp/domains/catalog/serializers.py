from rest_framework import serializers

from apiapp.domains.catalog.models import ObjectInstance, ObjectType, ObjectTypeProperty


class ObjectTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ObjectType
        fields = ["object_type_id", "object_type_name"]
        read_only_fields = ["object_type_id"]


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


class ObjectTypePropertySerializer(serializers.ModelSerializer):
    class Meta:
        model = ObjectTypeProperty
        fields = [
            "object_type_property_id",
            "object_type",
            "object_type_property_name",
            "object_type_property_category",
            "openserver",
        ]
        read_only_fields = ["object_type_property_id"]


__all__ = [
    "ObjectTypeSerializer",
    "ObjectInstanceSerializer",
    "ObjectTypePropertySerializer",
]
