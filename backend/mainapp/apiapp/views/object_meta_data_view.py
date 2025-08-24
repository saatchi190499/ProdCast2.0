from rest_framework.views import APIView
from rest_framework.response import Response
from apiapp.models import ObjectType, ObjectInstance, ObjectTypeProperty

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
            props = ObjectTypeProperty.objects.filter(object_type_id=t["id"]).values("object_type_property_id", "object_type_property_name")
            properties_by_type[t["name"]] = [{"id": x["object_type_property_id"], "name": x["object_type_property_name"]} for x in props]

        return Response({
            "types": type_list,
            "instances": instances_by_type,
            "properties": properties_by_type
        })
