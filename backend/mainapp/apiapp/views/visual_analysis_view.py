from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404

from ..models import DataSourceComponent, VisualAnalysisConfig, DataSource
from ..serializers import VisualAnalysisConfigSerializer


class VisualAnalysisConfigView(APIView):
    def get(self, request, component_id):
        component = get_object_or_404(DataSourceComponent, id=component_id)
        # Optional guard: ensure component belongs to VisualAnalysis data source
        if component.data_source.data_source_name != "VisualAnalysis":
            return Response({"error": "Component is not a VisualAnalysis component"}, status=400)

        obj, _ = VisualAnalysisConfig.objects.get_or_create(component=component)
        serializer = VisualAnalysisConfigSerializer(obj)
        return Response(serializer.data)

    def put(self, request, component_id):
        component = get_object_or_404(DataSourceComponent, id=component_id)
        if component.data_source.data_source_name != "VisualAnalysis":
            return Response({"error": "Component is not a VisualAnalysis component"}, status=400)

        obj, _ = VisualAnalysisConfig.objects.get_or_create(component=component)
        serializer = VisualAnalysisConfigSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save(component=component)  # keep component fixed
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

