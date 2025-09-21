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

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import tempfile, subprocess, os

class RunWorkflowView(APIView):
    def post(self, request, *args, **kwargs):
        code = request.data.get("code", "")
        if not code:
            return Response({"error": "No code provided"}, status=status.HTTP_400_BAD_REQUEST)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".py", mode="w") as tmp:
            tmp.write(code)
            tmp_path = tmp.name

        try:
            result = subprocess.run(
                ["python", tmp_path],
                capture_output=True,
                text=True,
                timeout=300  # ограничение 5 мин
            )
            return Response({
                "stdout": result.stdout,
                "stderr": result.stderr,
                "exit_code": result.returncode
            })
        except subprocess.TimeoutExpired:
            return Response({"error": "Execution timed out"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)