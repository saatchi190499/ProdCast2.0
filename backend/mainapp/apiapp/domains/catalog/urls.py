from django.urls import path

from apiapp.domains.catalog.views import (
    GapNetworkDataListView,
    ObjectInstanceListView,
    ObjectMetadataView,
    UnitSystemPropertyMappingView,
    UpdateInstancesView,
)

urlpatterns = [
    path("object-metadata/", ObjectMetadataView.as_view()),
    path("object-instances/", ObjectInstanceListView.as_view(), name="object-instances"),
    path("update-instances/", UpdateInstancesView.as_view(), name="update-instances"),
    path("unit-system-property-mapping/", UnitSystemPropertyMappingView.as_view()),
    path("gap-network-data/", GapNetworkDataListView.as_view()),
]

__all__ = ["urlpatterns"]
