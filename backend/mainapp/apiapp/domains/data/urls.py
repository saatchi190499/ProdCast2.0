from django.urls import path

from apiapp.domains.data.views import (
    DataSourceComponentCreateView,
    DataSourceComponentDetailView,
    DataSourceComponentsBySourceView,
    DataSourceListView,
    DeclineCurvesView,
    EventRecordsView,
    InternalRecordsView,
    MainClassHistoryView,
    PIRecordsView,
    WorkflowOutputsView,
    fetch_pi_value_for_component_row,
    pi_history_for_component_row,
)

urlpatterns = [
    path("data-sources/", DataSourceListView.as_view(), name="data-sources"),
    path("data-sources/<str:source_name>/components/", DataSourceComponentsBySourceView.as_view()),
    path("components/", DataSourceComponentCreateView.as_view(), name="components-create"),
    path("components/<int:pk>/", DataSourceComponentDetailView.as_view()),
    path("components/<int:component_id>/row/<int:row_id>/history/", MainClassHistoryView.as_view()),
    path("components/events/<int:component_id>", EventRecordsView.as_view()),
    path("components/internal/<int:component_id>", InternalRecordsView.as_view()),
    path("components/pi-records/<int:component_id>/row/<int:row_id>/fetch_value/", fetch_pi_value_for_component_row),
    path("components/pi-records/<int:component_id>/row/<int:row_id>/history/", pi_history_for_component_row),
    path("components/pi-records/<int:component_id>/", PIRecordsView.as_view()),
    path("components/decline-curves/<int:component_id>/", DeclineCurvesView.as_view()),
    path("components/<int:component_id>/workflow-outputs/", WorkflowOutputsView.as_view()),
]

__all__ = ["urlpatterns"]
