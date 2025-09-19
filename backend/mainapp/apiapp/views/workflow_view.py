import json
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from ..models import ScenarioComponent, Workflow
from ..serializers import WorkflowSerializer

class WorkflowRecordsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, component_id):
        component = get_object_or_404(
            ScenarioComponent,
            id=component_id,
            data_source__data_source_name="Workflows"  # 👈 follow FK
        )

        workflow, _ = Workflow.objects.get_or_create(component=component)
        serializer = WorkflowSerializer(workflow, context={"request": request})
        return Response(serializer.data)

    def put(self, request, component_id):
        component = get_object_or_404(
            ScenarioComponent,
            id=component_id,
            data_source__data_source_name="Workflows"  # 👈 follow FK
        )

        workflow, _ = Workflow.objects.get_or_create(component=component)
        serializer = WorkflowSerializer(workflow, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

