from rest_framework.views import APIView
from rest_framework.response import Response
from apiapp.models import ObjectType, ObjectInstance, ObjectTypeProperty, GapNetworkData
from ..serializers import ObjectInstanceSerializer
from rest_framework import status

class ObjectMetadataView(APIView):
    def get(self, request):
        # object types
        types = ObjectType.objects.all().values("object_type_id", "object_type_name")
        type_list = [{"id": t["object_type_id"], "name": t["object_type_name"]} for t in types]

        # object instances by type
        instances_by_type = {}
        for t in type_list:
            instances = ObjectInstance.objects.filter(object_type_id=t["id"]).values("object_instance_id", "object_instance_name")
            instances_by_type[t["name"]] = [{"id": x["object_instance_id"], "name": x["object_instance_name"]} for x in instances]

        # object properties by type
        properties_by_type = {}
        for t in type_list:
            # Query for properties and include the unit's name from the related UnitDefinition model
            props = ObjectTypeProperty.objects.filter(object_type_id=t["id"]).values(
                "object_type_property_id",
                "object_type_property_name",
                "unit__alias_text",  # Use double underscore to get the unit name
                "object_type_property_category"
            )
            properties_by_type[t["name"]] = [
                {
                    "id": x["object_type_property_id"],
                    "name": x["object_type_property_name"],
                    "unit": x["unit__alias_text"],  # Extract the unit name
                    "category": x["object_type_property_category"]
                } 
                for x in props
            ]

        return Response({
            "types": type_list,
            "instances": instances_by_type,
            "properties": properties_by_type
        })

class ObjectInstanceListView(APIView):
    def get(self, request):
        instances = ObjectInstance.objects.select_related("object_type").all()
        serializer = ObjectInstanceSerializer(instances, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
class GapNetworkDataListView(APIView):

    def get(self, request):
        data = []
        for obj in GapNetworkData.objects.all():
            # branches: {branch_point_uid: [pipe_dicts]}
            # Collect branch names (label or uid)
            branches = {}
            for bp, pipes in (obj.branches or {}).items():
                branches[bp] = [
                    {"label": pipe.get("label", pipe.get("uid", "")), "uid": pipe.get("uid", "")}
                    if isinstance(pipe, dict) else {"label": str(pipe), "uid": str(pipe)}
                    for pipe in pipes
                ]
            data.append({
                "well_name": obj.well_name,
                "branches": branches,
            })
        return Response(data)