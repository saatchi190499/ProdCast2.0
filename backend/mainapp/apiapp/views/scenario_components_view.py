# views.py

from ..models import ScenarioComponent, DataSource, MainClass, ScenarioClass
from ..serializers import ScenarioComponentSerializer, DataSourceSerializer, MainClassSerializer
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.generics import CreateAPIView, RetrieveUpdateDestroyAPIView, ListAPIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
import os
from django.core.files.base import ContentFile
from django.utils.text import slugify
from django.shortcuts import get_object_or_404
from django.utils.timezone import now

class DataSourceListView(APIView):
    def get(self, request):
        sources = DataSource.objects.all()
        serializer = DataSourceSerializer(sources, many=True)
        return Response(serializer.data)

class ScenarioComponentsBySourceView(APIView):
    def get(self, request, source_name):
        try:
            source = DataSource.objects.get(data_source_name__iexact=source_name)
            components = ScenarioComponent.objects.filter(data_source=source)
            serializer = ScenarioComponentSerializer(components, many=True)
            return Response(serializer.data)
        except DataSource.DoesNotExist:
            return Response({"error": "DataSource not found"}, status=status.HTTP_404_NOT_FOUND)

class ScenarioComponentCreateView(CreateAPIView):
    queryset = ScenarioComponent.objects.all()
    serializer_class = ScenarioComponentSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        request = self.request
        uploaded_file = request.FILES.get("file")
        name = request.data.get("name")

        # Удаляем файл из validated_data, чтобы он не сохранился автоматически
        validated_data = serializer.validated_data
        validated_data.pop('file', None)

        instance = serializer.save(created_by=request.user)

        # Ручное сохранение файла, если нужно
        if uploaded_file and name:
            ext = os.path.splitext(uploaded_file.name)[1]
            safe_name = f"{name}{ext}"
            instance.file.save(safe_name, uploaded_file, save=True)

class ScenarioComponentDetailView(RetrieveUpdateDestroyAPIView):
    queryset = ScenarioComponent.objects.all()
    serializer_class = ScenarioComponentSerializer
    permission_classes = [IsAuthenticated]

    def perform_destroy(self, instance):
        # Удалить файл с диска если есть
        if instance.file:
            instance.file.delete(save=False)
        instance.delete()

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.utils.timezone import now
from apiapp.models import ScenarioComponent, MainClass
from apiapp.serializers import MainClassSerializer


class EventRecordsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, component_id):
        """Return all records for the given component."""
        component = get_object_or_404(ScenarioComponent, id=component_id)
        events = MainClass.objects.filter(
            data_source_id=component.id,
            data_source_name=component.data_source
        ).order_by("date_time")
        serializer = MainClassSerializer(events, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, component_id):
        """
        Updates existing rows, creates new ones, and optionally deletes missing ones.
        """
        component = get_object_or_404(ScenarioComponent, id=component_id)
        records = request.data

        if not isinstance(records, list):
            return Response({"error": "Expected a list of records"}, status=400)

        # Get current records in DB
        existing_records = {
            r.data_set_id: r for r in MainClass.objects.filter(
                data_source_id=component.id,
                data_source_name=component.data_source
            )
        }

        sent_ids = set()
        results = []

        for r in records:
            rec_id = r.get("data_set_id")
            if rec_id and rec_id in existing_records:
                # 🔁 Update existing record
                obj = existing_records[rec_id]
                serializer = MainClassSerializer(
                    obj,
                    data=r,
                    partial=True,
                    context={
                        "data_source_id": component.id,
                        "data_source_name": component.data_source
                    }
                )
                if serializer.is_valid():
                    serializer.save()
                    sent_ids.add(rec_id)
                    results.append({"id": rec_id, "status": "updated"})
                else:
                    results.append({"id": rec_id, "status": "error", "errors": serializer.errors})
            else:
                # ➕ Create new record
                serializer = MainClassSerializer(
                    data=r,
                    context={
                        "data_source_id": component.id,
                        "data_source_name": component.data_source
                    }
                )
                if serializer.is_valid():
                    obj = serializer.save()
                    sent_ids.add(obj.data_set_id)
                    results.append({"id": obj.data_set_id, "status": "created"})
                else:
                    results.append({"status": "error", "errors": serializer.errors})

        # Optional delete: remove records not sent from frontend
        for rec_id, obj in existing_records.items():
            if rec_id not in sent_ids:
                obj.delete()
                results.append({"id": rec_id, "status": "deleted"})

        # Update component timestamp
        component.last_updated = now()
        component.save(update_fields=["last_updated"])

        return Response(results, status=status.HTTP_200_OK)


from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.utils.timezone import now
from apiapp.models import ScenarioComponent, MainClass
from apiapp.serializers import MainClassSerializer
from apiapp.utils.pi_utils import generate_web_id_raw, get_value_at_time


class PIRecordsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, component_id):
        component = get_object_or_404(ScenarioComponent, id=component_id)
        records = MainClass.objects.filter(
            data_source_id=component.id,
            data_source_name=component.data_source
        ).order_by("object_instance__object_instance_name")
        serializer = MainClassSerializer(records, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, component_id):
        component = get_object_or_404(ScenarioComponent, id=component_id)
        records = request.data
        if not isinstance(records, list):
            return Response({"error": "Expected a list of records"}, status=400)

        existing_records = {
            r.data_set_id: r for r in MainClass.objects.filter(
                data_source_id=component.id,
                data_source_name=component.data_source
            )
        }

        sent_ids = set()
        results = []

        for r in records:
            if not r.get("date_time"):
                r["date_time"] = now().isoformat()

            rec_id = r.get("data_set_id")

            # 🧩 Determine if we are updating or creating
            if rec_id and rec_id in existing_records:
                obj = existing_records[rec_id]
                serializer = MainClassSerializer(
                    obj, data=r, partial=True,
                    context={"data_source_id": component.id, "data_source_name": component.data_source}
                )
                if serializer.is_valid():
                    obj = serializer.save()
                    sent_ids.add(rec_id)
                else:
                    results.append({"id": rec_id, "status": "error", "errors": serializer.errors})
                    continue
            else:
                serializer = MainClassSerializer(
                    data=r,
                    context={"data_source_id": component.id, "data_source_name": component.data_source}
                )
                if serializer.is_valid():
                    obj = serializer.save()
                    sent_ids.add(obj.data_set_id)
                else:
                    results.append({"status": "error", "errors": serializer.errors})
                    continue

            # ✅ Auto-fetch latest PI value after save
            if obj.tag:
                try:
                    web_id = generate_web_id_raw(obj.tag, id_type="Attributes")
                    pi_value = get_value_at_time(web_id, "*")  # * means current value
                    if pi_value and "Value" in pi_value:
                        obj.value = pi_value["Value"]
                        obj.date_time = now()
                        obj.save(update_fields=["value", "date_time"])
                except Exception as e:
                    results.append({
                        "id": obj.data_set_id,
                        "status": "pi_fetch_error",
                        "error": str(e),
                        "tag": obj.tag
                    })
                    continue

            results.append({
                "id": obj.data_set_id,
                "status": "updated" if rec_id else "created",
                "tag": obj.tag,
                "value": obj.value,
                "date_time": obj.date_time.isoformat() if obj.date_time else None
            })

        # Optional delete logic
        for rec_id, obj in existing_records.items():
            if rec_id not in sent_ids:
                obj.delete()
                results.append({"id": rec_id, "status": "deleted", "tag": obj.tag})

        component.last_updated = now()
        component.save(update_fields=["last_updated"])

        return Response(results, status=status.HTTP_200_OK)

