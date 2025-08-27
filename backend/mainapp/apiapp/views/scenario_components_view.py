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

class EventRecordsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, component_id):
        component = get_object_or_404(ScenarioComponent, id=component_id)
        events = MainClass.objects.filter(
            data_source_id=component.id,
            data_source_name=component.data_source
        )
        serializer = MainClassSerializer(events, many=True)
        return Response(serializer.data)

    def post(self, request, component_id):
        component = get_object_or_404(ScenarioComponent, id=component_id)

        # Удаляем старые записи (если нужно)
        MainClass.objects.filter(
            data_source_id=component.id,
            data_source_name=component.data_source
        ).delete()

        # Новый сериализатор с context
        serializer = MainClassSerializer(
            data=request.data,
            many=True,
            context={
                "data_source_id": component.id,
                "data_source_name": component.data_source
            }
        )
        
        if serializer.is_valid():
            serializer.save()

            component.last_updated = now()
            component.save(update_fields=["last_updated"])

            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)