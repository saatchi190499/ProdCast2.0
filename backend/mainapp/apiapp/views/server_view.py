from rest_framework import viewsets
from rest_framework.permissions import IsAdminUser
from ..models import ServersClass
from ..serializers import ServerSerializer

class ServerViewSet(viewsets.ModelViewSet):
    queryset = ServersClass.objects.all()
    serializer_class = ServerSerializer
    permission_classes = [IsAdminUser]  # доступ только админам