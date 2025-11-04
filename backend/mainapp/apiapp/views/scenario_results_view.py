from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime

from ..models import ScenarioClass, ScenarioComponentLink, MainClass
from ..serializers import MainClassSerializer


class ScenarioResultsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, scenario_id: int):
        """
        Returns all MainClass records produced for a given scenario across its linked components.

        Optional query params:
        - start: ISO datetime (filters records with date_time >= start)
        - end:   ISO datetime (filters records with date_time <= end)
        """
        scenario = get_object_or_404(ScenarioClass, scenario_id=scenario_id)

        # Some scenario runs may not stamp component_id; rely solely on scenario_id
        qs = MainClass.objects.filter(scenario_id=scenario_id).order_by("date_time")

        # Optional date range filters
        start_s = request.query_params.get("start")
        end_s = request.query_params.get("end")
        if start_s:
            dt = parse_datetime(start_s)
            if dt:
                qs = qs.filter(date_time__gte=dt)
        if end_s:
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
