import os
import tempfile

from django.db import transaction
from django.shortcuts import get_object_or_404
from apiapp.domains.integration.petex_client import gap
from apiapp.domains.integration.petex_client.server import PetexServer
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apiapp.domains.catalog.models import (
    GapNetworkData,
    ObjectInstance,
    ObjectType,
    ObjectTypeProperty,
    UnitSystem,
    UnitSystemCategoryDefinition,
)
from apiapp.domains.catalog.serializers import ObjectInstanceSerializer


class ObjectMetadataView(APIView):
    def get(self, request):
        types = ObjectType.objects.all().values("object_type_id", "object_type_name")
        type_list = [{"id": t["object_type_id"], "name": t["object_type_name"]} for t in types]

        instances_by_type = {}
        for t in type_list:
            instances = ObjectInstance.objects.filter(object_type_id=t["id"]).values(
                "object_instance_id", "object_instance_name"
            )
            instances_by_type[t["name"]] = [{"id": x["object_instance_id"], "name": x["object_instance_name"]} for x in instances]

        properties_by_type = {}
        for t in type_list:
            props = ObjectTypeProperty.objects.filter(object_type_id=t["id"]).values(
                "object_type_property_id",
                "object_type_property_name",
                "unit__alias_text",
                "object_type_property_category",
            )
            properties_by_type[t["name"]] = [
                {
                    "id": x["object_type_property_id"],
                    "name": x["object_type_property_name"],
                    "unit": x["unit__alias_text"],
                    "category": x["object_type_property_category"],
                }
                for x in props
            ]

        return Response({"types": type_list, "instances": instances_by_type, "properties": properties_by_type})


class ObjectInstanceListView(APIView):
    def get(self, request):
        instances = ObjectInstance.objects.select_related("object_type").all()
        serializer = ObjectInstanceSerializer(instances, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class GapNetworkDataListView(APIView):
    def get(self, request):
        data = []
        for obj in GapNetworkData.objects.all():
            branches = {}
            for bp, pipes in (obj.branches or {}).items():
                branches[bp] = [
                    {"label": pipe.get("label", pipe.get("uid", "")), "uid": pipe.get("uid", "")}
                    if isinstance(pipe, dict)
                    else {"label": str(pipe), "uid": str(pipe)}
                    for pipe in pipes
                ]
            data.append({"well_name": obj.well_name, "branches": branches})
        return Response(data)


class UnitSystemPropertyMappingView(APIView):
    def get(self, request):
        result = []
        for unit_system in UnitSystem.objects.all():
            system_data = {
                "unit_system_id": unit_system.unit_system_id,
                "unit_system_name": unit_system.unit_system_name,
                "properties": [],
            }
            for prop in ObjectTypeProperty.objects.select_related("unit_category"):
                unit_def = (
                    UnitSystemCategoryDefinition.objects.filter(
                        unit_system=unit_system,
                        unit_category=prop.unit_category,
                    )
                    .select_related("unit_definition")
                    .first()
                )
                if unit_def and unit_def.unit_definition:
                    system_data["properties"].append(
                        {
                            "property_id": prop.object_type_property_id,
                            "property_name": prop.object_type_property_name,
                            "unit": unit_def.unit_definition.alias_text,
                            "scale_factor": float(unit_def.unit_definition.scale_factor),
                            "offset": float(unit_def.unit_definition.offset),
                        }
                    )
                else:
                    system_data["properties"].append(
                        {
                            "property_id": prop.object_type_property_id,
                            "property_name": prop.object_type_property_name,
                            "unit": None,
                            "scale_factor": 1.0,
                            "offset": 0.0,
                        }
                    )
            result.append(system_data)
        return Response(result)


class UpdateInstancesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            file_obj = request.FILES.get("gap_file")
            if not file_obj:
                return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

            with tempfile.NamedTemporaryFile(delete=False, suffix=".gap") as tmp:
                for chunk in file_obj.chunks():
                    tmp.write(chunk)
                gap_path = tmp.name

            try:
                from apiapp.domains.integration.petex_client import gap_tools

                with PetexServer() as srv:
                    gap.start(srv)
                    gap.open_file(srv, gap_path)
                    equips = update_equip_types_and_instances(srv)

                    topology = gap_tools.extract_topology(srv)
                    all_branches = topology.get("branches", {})
                    for well_name, paths in topology.get("routes_named", {}).items():
                        route_uids = set()
                        for path in paths:
                            route_uids.update([seg["uid"] if isinstance(seg, dict) else seg for seg in path])

                        well_branches = {}
                        for bp, pipes in all_branches.items():
                            filtered_pipes = [
                                pipe for pipe in pipes if (pipe.get("uid") if isinstance(pipe, dict) else pipe) in route_uids
                            ]
                            if filtered_pipes:
                                well_branches[bp] = filtered_pipes

                        all_trunks = topology.get("trunks", [])
                        filtered_trunks = [trunk for trunk in all_trunks if (trunk.get("uid") if isinstance(trunk, dict) else trunk) in route_uids]

                        GapNetworkData.objects.create(
                            well_name=well_name,
                            paths=paths,
                            branches=well_branches,
                            trunks=filtered_trunks,
                        )

                    gap.shutdown(srv)
            finally:
                os.remove(gap_path)

            return Response({"message": "Types & Instances updated, topology saved", "data": equips}, status=status.HTTP_200_OK)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def update_equip_types_and_instances(srv: PetexServer):
    """
    Sync ObjectType and ObjectInstance rows with EQUIP contents from a GAP file.
    """
    equips = gap.get_all_equips(srv)
    gap_types = set(equips.keys())

    with transaction.atomic():
        obj_types = {}
        for type_name in gap_types:
            obj_type, _ = ObjectType.objects.get_or_create(object_type_name=type_name)
            obj_types[type_name] = obj_type

        ObjectType.objects.exclude(object_type_name__in=gap_types).delete()

        for type_name, labels in equips.items():
            obj_type = obj_types[type_name]

            new_instances = set(labels)
            existing = set(
                ObjectInstance.objects.filter(object_type=obj_type).values_list("object_instance_name", flat=True)
            )

            for name in new_instances - existing:
                ObjectInstance.objects.create(object_type=obj_type, object_instance_name=name)

            for name in existing - new_instances:
                ObjectInstance.objects.filter(object_type=obj_type, object_instance_name=name).delete()

    return equips


__all__ = [
    "ObjectMetadataView",
    "ObjectInstanceListView",
    "GapNetworkDataListView",
    "UnitSystemPropertyMappingView",
    "UpdateInstancesView",
    "update_equip_types_and_instances",
]
