    
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from ..models import ScenarioClass, ScenarioComponent, ScenarioComponentLink, DataSource
from ..serializers import ScenarioClassSerializer, ScenarioComponentSerializer
from django.shortcuts import get_object_or_404

class ScenarioCreateView(APIView):
    """
    POST {
        "scenario_name": "...",
        "description": "...",
        "created_by": "...",
        "status": "new",
        "components": [
            {"data_source_id": 1, "component_id": 5},
            {"data_source_id": 2, "component_id": 8}
        ]
    }
    """
    def post(self, request):
        scenario_name = request.data.get("scenario_name")
        description = request.data.get("description", "")
        components = request.data.get("components", [])

        if not scenario_name or not components:
            return Response({"error": "Scenario name and components required."}, status=status.HTTP_400_BAD_REQUEST)

        scenario = ScenarioClass.objects.create(
            scenario_name=scenario_name,
            description=description,
            created_by=request.user,
            status = "new",
        )

        # Link one component per data source
        for comp in components:
            data_source_id = comp.get("data_source_id")
            component_id = comp.get("component_id")
            if not data_source_id or not component_id:
                continue
            component = get_object_or_404(ScenarioComponent, id=component_id, data_source_id=data_source_id)
            ScenarioComponentLink.objects.create(
                scenario=scenario,
                component=component
            )

        serializer = ScenarioClassSerializer(scenario)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

class ComponentsByDataSourceView(APIView):
    """
    GET: Returns components grouped by data source
    """
    def get(self, request):
        sources = DataSource.objects.all()
        result = []
        for source in sources:
            comps = ScenarioComponent.objects.filter(data_source=source)
            comps_ser = ScenarioComponentSerializer(comps, many=True).data
            result.append({
                "data_source_id": source.id,
                "data_source_name": source.data_source_name,
                "components": comps_ser
            })
        return Response(result)
    
class ScenarioListView(APIView):
    def get(self, request):
        scenarios = ScenarioClass.objects.select_related("created_by", "server").all()
        result = []
        for scenario in scenarios:
            links = ScenarioComponentLink.objects.filter(scenario=scenario).select_related("component")
            components = []
            for link in links:
                comp = link.component
                components.append({
                    "id": comp.id,
                    "name": getattr(comp, "name", ""),
                    "description": getattr(comp, "description", ""),
                    "data_source_name": getattr(comp.data_source, "data_source_name", ""),
                })
            result.append({
                "scenario_id": scenario.scenario_id,
                "scenario_name": scenario.scenario_name,
                "description": scenario.description,
                "status": scenario.status,
                "start_date": scenario.start_date,
                "end_date": scenario.end_date,
                "server": getattr(scenario.server, "server_name", None),
                "is_approved": scenario.is_approved,
                "created_by": getattr(scenario.created_by, "username", None),
                "created_date": scenario.created_date,
                "components": components
            })
        return Response(result)