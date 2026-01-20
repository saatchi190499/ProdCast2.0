import os

import pandas as pd
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.timezone import now
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.generics import CreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from apiapp.domains.integration.pi_client import series as pi_series
from apiapp.domains.integration.pi_client import value as pi_value

from apiapp.domains.data.models import DataSource, DataSourceComponent, MainClass
from apiapp.domains.data.serializers import (
    DataSourceComponentSerializer,
    DataSourceSerializer,
    MainClassSerializer,
)


class DataSourceListView(APIView):
    def get(self, request):
        sources = DataSource.objects.all()
        serializer = DataSourceSerializer(sources, many=True)
        return Response(serializer.data)


class DataSourceComponentsBySourceView(APIView):
    def get(self, request, source_name):
        try:
            source = DataSource.objects.get(data_source_name__iexact=source_name)
            components = DataSourceComponent.objects.filter(data_source=source)
            serializer = DataSourceComponentSerializer(components, many=True)
            return Response(serializer.data)
        except DataSource.DoesNotExist:
            return Response({"error": "DataSource not found"}, status=status.HTTP_404_NOT_FOUND)


class DataSourceComponentCreateView(CreateAPIView):
    queryset = DataSourceComponent.objects.all()
    serializer_class = DataSourceComponentSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        request = self.request
        uploaded_file = request.FILES.get("file")
        name = request.data.get("name")

        validated_data = serializer.validated_data
        validated_data.pop("file", None)

        instance = serializer.save(created_by=request.user)

        if uploaded_file and name:
            ext = os.path.splitext(uploaded_file.name)[1]
            safe_name = f"{name}{ext}"
            instance.file.save(safe_name, uploaded_file, save=True)


class DataSourceComponentDetailView(RetrieveUpdateDestroyAPIView):
    queryset = DataSourceComponent.objects.all()
    serializer_class = DataSourceComponentSerializer
    permission_classes = [IsAuthenticated]

    def perform_destroy(self, instance):
        if instance.file:
            instance.file.delete(save=False)
        instance.delete()


class EventRecordsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, component_id):
        component = get_object_or_404(DataSourceComponent, id=component_id)
        events = MainClass.objects.filter(component=component).order_by("date_time")
        serializer = MainClassSerializer(events, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, component_id):
        component = get_object_or_404(DataSourceComponent, id=component_id)
        records = request.data

        if not isinstance(records, list):
            return Response({"error": "Expected a list of records"}, status=400)

        existing_records = {r.data_set_id: r for r in MainClass.objects.filter(component=component)}

        sent_ids = set()
        results = []

        for r in records:
            rec_id = r.get("data_set_id")
            if rec_id and rec_id in existing_records:
                obj = existing_records[rec_id]
                serializer = MainClassSerializer(obj, data=r, partial=True, context={"component": component})
                if serializer.is_valid():
                    serializer.save()
                    sent_ids.add(rec_id)
                    results.append({"id": rec_id, "status": "updated"})
                else:
                    results.append({"id": rec_id, "status": "error", "errors": serializer.errors})
            else:
                serializer = MainClassSerializer(data=r, context={"component": component})
                if serializer.is_valid():
                    obj = serializer.save()
                    sent_ids.add(obj.data_set_id)
                    results.append({"id": obj.data_set_id, "status": "created"})
                else:
                    results.append({"status": "error", "errors": serializer.errors})

        for rec_id, obj in existing_records.items():
            if rec_id not in sent_ids:
                obj.delete()
                results.append({"id": rec_id, "status": "deleted"})

        component.last_updated = now()
        component.save(update_fields=["last_updated"])

        return Response(results, status=status.HTTP_200_OK)


class InternalRecordsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, component_id):
        component = get_object_or_404(DataSourceComponent, id=component_id)
        if component.data_source.data_source_name != "Internal":
            return Response({"error": "Component is not an Internal source"}, status=status.HTTP_400_BAD_REQUEST)
        records = MainClass.objects.filter(component=component).order_by("date_time")
        serializer = MainClassSerializer(records, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, component_id):
        component = get_object_or_404(DataSourceComponent, id=component_id)
        if component.data_source.data_source_name != "Internal":
            return Response({"error": "Component is not an Internal source"}, status=status.HTTP_400_BAD_REQUEST)

        records = request.data
        if not isinstance(records, list):
            return Response({"error": "Expected a list of records"}, status=400)

        existing_records = {r.data_set_id: r for r in MainClass.objects.filter(component=component)}

        sent_ids = set()
        results = []

        for r in records:
            rec_id = r.get("data_set_id")
            if rec_id and rec_id in existing_records:
                obj = existing_records[rec_id]
                serializer = MainClassSerializer(obj, data=r, partial=True, context={"component": component})
                if serializer.is_valid():
                    serializer.save()
                    sent_ids.add(rec_id)
                    results.append({"id": rec_id, "status": "updated"})
                else:
                    results.append({"id": rec_id, "status": "error", "errors": serializer.errors})
            else:
                serializer = MainClassSerializer(data=r, context={"component": component})
                if serializer.is_valid():
                    obj = serializer.save()
                    sent_ids.add(obj.data_set_id)
                    results.append({"id": obj.data_set_id, "status": "created"})
                else:
                    results.append({"status": "error", "errors": serializer.errors})

        for rec_id, obj in existing_records.items():
            if rec_id not in sent_ids:
                obj.delete()
                results.append({"id": rec_id, "status": "deleted"})

        component.last_updated = now()
        component.save(update_fields=["last_updated"])

        return Response(results, status=status.HTTP_200_OK)


class PIRecordsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, component_id):
        component = get_object_or_404(DataSourceComponent, id=component_id)
        records = MainClass.objects.filter(component=component).order_by("object_instance__object_instance_name")
        serializer = MainClassSerializer(records, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, component_id):
        component = get_object_or_404(DataSourceComponent, id=component_id)
        records = request.data
        if not isinstance(records, list):
            return Response({"error": "Expected a list of records"}, status=400)

        existing_records = {r.data_set_id: r for r in MainClass.objects.filter(component=component)}

        sent_ids = set()
        results = []

        for r in records:
            if not r.get("date_time"):
                r["date_time"] = now().isoformat()

            rec_id = r.get("data_set_id")

            if rec_id and rec_id in existing_records:
                obj = existing_records[rec_id]
                serializer = MainClassSerializer(obj, data=r, partial=True, context={"component": component})
                if serializer.is_valid():
                    obj = serializer.save()
                    sent_ids.add(rec_id)
                else:
                    results.append({"id": rec_id, "status": "error", "errors": serializer.errors})
                    continue
            else:
                serializer = MainClassSerializer(data=r, context={"component": component})
                if serializer.is_valid():
                    obj = serializer.save()
                    sent_ids.add(obj.data_set_id)
                else:
                    results.append({"status": "error", "errors": serializer.errors})
                    continue

            if obj.tag:
                try:
                    latest = pi_value(obj.tag, time="*", id_type="Attributes")
                    if latest and "Value" in latest:
                        obj.value = latest["Value"]
                        obj.date_time = now()
                        obj.save(update_fields=["value", "date_time"])
                except Exception as e:
                    results.append(
                        {
                            "id": obj.data_set_id,
                            "status": "pi_fetch_error",
                            "error": str(e),
                            "tag": obj.tag,
                        }
                    )
                    continue

            results.append(
                {
                    "id": obj.data_set_id,
                    "status": "updated" if rec_id else "created",
                    "tag": obj.tag,
                    "value": obj.value,
                    "date_time": obj.date_time.isoformat() if obj.date_time else None,
                }
            )

        for rec_id, obj in existing_records.items():
            if rec_id not in sent_ids:
                obj.delete()
                results.append({"id": rec_id, "status": "deleted", "tag": obj.tag})

        component.last_updated = now()
        component.save(update_fields=["last_updated"])

        return Response(results, status=status.HTTP_200_OK)


class DeclineCurvesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, component_id):
        component = get_object_or_404(DataSourceComponent, id=component_id)
        records = MainClass.objects.filter(component=component).order_by(
            "object_instance__object_instance_name",
            "object_type_property__object_type_property_name",
        )
        serializer = MainClassSerializer(records, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, component_id):
        component = get_object_or_404(DataSourceComponent, id=component_id)
        records = request.data
        if not isinstance(records, list):
            return Response({"error": "Expected a list of records"}, status=400)

        existing_records = {r.data_set_id: r for r in MainClass.objects.filter(component=component)}
        sent_ids = set()
        touched_instance_ids = set()
        results = []

        for r in records:
            if not r.get("date_time"):
                r["date_time"] = now().isoformat()

            rec_id = r.get("data_set_id")
            if rec_id and rec_id in existing_records:
                obj = existing_records[rec_id]
                serializer = MainClassSerializer(obj, data=r, partial=True, context={"component": component})
                if serializer.is_valid():
                    obj = serializer.save()
                    sent_ids.add(rec_id)
                    if obj.object_instance_id:
                        touched_instance_ids.add(obj.object_instance_id)
                    results.append({"id": obj.data_set_id, "status": "updated", "value": obj.value})
                else:
                    results.append({"id": rec_id, "status": "error", "errors": serializer.errors})
            else:
                serializer = MainClassSerializer(data=r, context={"component": component})
                if serializer.is_valid():
                    obj = serializer.save()
                    sent_ids.add(obj.data_set_id)
                    if obj.object_instance_id:
                        touched_instance_ids.add(obj.object_instance_id)
                    results.append({"id": obj.data_set_id, "status": "created", "value": obj.value})
                else:
                    results.append({"status": "error", "errors": serializer.errors})

        for rec_id, obj in list(existing_records.items()):
            if rec_id not in sent_ids and (obj.object_instance_id in touched_instance_ids):
                obj.delete()
                results.append({"id": rec_id, "status": "deleted"})

        component.last_updated = now()
        component.save(update_fields=["last_updated"])

        return Response(results, status=status.HTTP_200_OK)


@api_view(["POST"])
def fetch_pi_value_for_component_row(request, component_id, row_id):
    try:
        component = DataSourceComponent.objects.get(id=component_id)
        row = MainClass.objects.get(component=component, pk=row_id)

        if not row.tag:
            return Response({"error": "Row has no PI tag"}, status=400)

        iso_time_str = request.data.get("time") or timezone.now().isoformat()
        result = pi_value(row.tag, time=iso_time_str, id_type="Attributes")

        if not result or "Value" not in result:
            return Response({"error": "No PI value found"}, status=404)

        value = result["Value"]
        timestamp = result.get("Timestamp", iso_time_str)
        row.value = value
        row.date_time = pd.to_datetime(timestamp)
        row.save(update_fields=["value", "date_time"])

        return Response({"id": row.data_set_id, "tag": row.tag, "value": value, "date_time": row.date_time.isoformat()})

    except MainClass.DoesNotExist:
        return Response({"error": "Row not found for this component"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)


@api_view(["GET"])
def pi_history_for_component_row(request, component_id, row_id):
    try:
        component = DataSourceComponent.objects.get(id=component_id)
        row = MainClass.objects.get(component=component, pk=row_id)

        if not row.tag:
            return Response({"error": "No tag for this row"}, status=400)

        start = request.GET.get("start", "2024-06-03T00:00:00Z")
        end = request.GET.get("end", "2025-06-10T00:00:00Z")
        interval = request.GET.get("interval", "1h")

        df = pi_series(row.tag, start, end, interval=interval, id_type="Attributes")

        return Response(df.to_dict(orient="records"))

    except MainClass.DoesNotExist:
        return Response({"error": "Row not found for this component"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)


__all__ = [
    "DataSourceListView",
    "DataSourceComponentsBySourceView",
    "DataSourceComponentCreateView",
    "DataSourceComponentDetailView",
    "EventRecordsView",
    "InternalRecordsView",
    "PIRecordsView",
    "DeclineCurvesView",
    "fetch_pi_value_for_component_row",
    "pi_history_for_component_row",
]
