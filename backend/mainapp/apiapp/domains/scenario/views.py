from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apiapp.domains.data.models import DataSource, DataSourceComponent, MainClass
from apiapp.domains.data.serializers import DataSourceComponentSerializer, MainClassSerializer
from apiapp.domains.scenario.models import ScenarioClass, ScenarioComponentLink
from apiapp.domains.scenario.serializers import ScenarioClassSerializer, ScenarioLogSerializer
from mainapp.celery import app


class ScenarioCreateView(APIView):
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
            status="new",
        )

        for comp in components:
            component_id = comp.get("component_id")
            if not component_id:
                continue
            component = get_object_or_404(DataSourceComponent, id=component_id)
            ScenarioComponentLink.objects.create(scenario=scenario, component=component)

        serializer = ScenarioClassSerializer(scenario)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ComponentsByDataSourceView(APIView):
    def get(self, request):
        sources = DataSource.objects.filter(data_source_type="FORECAST")
        result = []
        for source in sources:
            comps = DataSourceComponent.objects.filter(data_source=source)
            comps_ser = DataSourceComponentSerializer(comps, many=True).data
            result.append(
                {
                    "data_source_id": source.id,
                    "data_source_name": source.data_source_name,
                    "components": comps_ser,
                }
            )
        return Response(result)


class ScenarioListView(APIView):
    def get(self, request):
        scenarios = ScenarioClass.objects.select_related("created_by").all()
        result = []
        for scenario in scenarios:
            links = ScenarioComponentLink.objects.filter(scenario=scenario).select_related("component")
            components = []
            for link in links:
                comp = link.component
                components.append(
                    {
                        "id": comp.id,
                        "name": getattr(comp, "name", ""),
                        "description": getattr(comp, "description", ""),
                        "data_source_name": getattr(comp.data_source, "data_source_name", ""),
                    }
                )
            result.append(
                {
                    "scenario_id": scenario.scenario_id,
                    "scenario_name": scenario.scenario_name,
                    "description": scenario.description,
                    "status": scenario.status,
                    "start_date": scenario.start_date,
                    "end_date": scenario.end_date,
                    "is_approved": scenario.is_approved,
                    "created_by": getattr(scenario.created_by, "username", None),
                    "created_date": scenario.created_date,
                    "components": components,
                }
            )
        return Response(result)


class ScenarioLogsView(APIView):
    def get(self, request, scenario_id):
        scenario = ScenarioClass.objects.get(scenario_id=scenario_id)
        logs = scenario.logs.order_by("timestamp")
        serializer = ScenarioLogSerializer(logs, many=True)
        return Response(serializer.data)


class ScenarioDeleteView(APIView):
    def delete(self, request, scenario_id):
        scenario = get_object_or_404(ScenarioClass, scenario_id=scenario_id)
        user = request.user if hasattr(request, "user") else None

        if user and (getattr(user, "is_superuser", False) or scenario.created_by_id == getattr(user, "id", None)):
            scenario.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)


class ScenarioResultsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, scenario_id: int):
        scenario = get_object_or_404(ScenarioClass, scenario_id=scenario_id)

        qs = MainClass.objects.filter(scenario_id=scenario_id).order_by("date_time")

        start_s = request.query_params.get("start")
        end_s = request.query_params.get("end")
        if start_s:
            from django.utils.dateparse import parse_datetime
            dt = parse_datetime(start_s)
            if dt:
                qs = qs.filter(date_time__gte=dt)
        if end_s:
            from django.utils.dateparse import parse_datetime
            dt = parse_datetime(end_s)
            if dt:
                qs = qs.filter(date_time__lte=dt)

        data = {
            "scenario": {
                "scenario_id": scenario.scenario_id,
                "scenario_name": scenario.scenario_name,
                "status": scenario.status,
            },
            "components": [
                {
                    "id": link.component_id,
                    "name": getattr(link.component, "name", ""),
                    "data_source_name": getattr(link.component.data_source, "data_source_name", ""),
                }
                for link in ScenarioComponentLink.objects.select_related("component", "component__data_source").filter(scenario=scenario)
            ],
            "records": MainClassSerializer(qs, many=True).data,
        }

        return Response(data, status=status.HTTP_200_OK)


class RunScenarioView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, scenario_id):
        start_date = request.data.get("start_date")
        end_date = request.data.get("end_date")

        if not scenario_id or not start_date or not end_date:
            return Response({"error": "Missing parameters"}, status=status.HTTP_400_BAD_REQUEST)

        task = app.send_task("worker.run_scenario", args=[scenario_id, start_date, end_date], queue="scenarios")

        scenario = ScenarioClass.objects.get(pk=scenario_id)
        scenario.task_id = task.id
        scenario.status = "QUEUED"
        scenario.save()

        return Response({"task_id": task.id, "status": "QUEUED"})


__all__ = [
    "ScenarioCreateView",
    "ComponentsByDataSourceView",
    "ScenarioListView",
    "ScenarioLogsView",
    "ScenarioDeleteView",
    "ScenarioResultsView",
    "RunScenarioView",
]
