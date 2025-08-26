from rest_framework.views import APIView
from rest_framework.response import Response
from apiapp.models import UnitSystem, ObjectTypeProperty, UnitSystemCategoryDefinition

class UnitSystemPropertyMappingView(APIView):
    def get(self, request):
        result = []
        for unit_system in UnitSystem.objects.all():
            system_data = {
                "unit_system_id": unit_system.unit_system_id,
                "unit_system_name": unit_system.unit_system_name,
                "properties": []
            }
            for prop in ObjectTypeProperty.objects.select_related('unit_category'):
                unit_def = UnitSystemCategoryDefinition.objects.filter(
                    unit_system=unit_system,
                    unit_category=prop.unit_category
                ).select_related('unit_definition').first()
                if unit_def and unit_def.unit_definition:
                    system_data["properties"].append({
                        "property_id": prop.object_type_property_id,
                        "property_name": prop.object_type_property_name,
                        "unit": unit_def.unit_definition.alias_text,
                        "scale_factor": float(unit_def.unit_definition.scale_factor),
                        "offset": float(unit_def.unit_definition.offset)
                    })
                else:
                    system_data["properties"].append({
                        "property_id": prop.object_type_property_id,
                        "property_name": prop.object_type_property_name,
                        "unit": None,
                        "scale_factor": 1.0,
                        "offset": 0.0
                    })
            result.append(system_data)
        return Response(result)