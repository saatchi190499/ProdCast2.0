from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apiapp.domains.analytics.models import VisualAnalysisConfig
from apiapp.domains.analytics.serializers import VisualAnalysisConfigSerializer
from apiapp.domains.data.models import DataSource, DataSourceComponent


class VisualAnalysisConfigView(APIView):
    def get(self, request, component_id):
        component = get_object_or_404(DataSourceComponent, id=component_id)
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
            serializer.save(component=component)
            return Response(serializer.data)
        return Response(serializer.errors, status=400)


__all__ = ["VisualAnalysisConfigView"]
