from django.urls import path

from apiapp.domains.scenario.views import (
    ComponentsByDataSourceView,
    RunScenarioView,
    ScenarioCreateView,
    ScenarioDeleteView,
    ScenarioListView,
    ScenarioLogsView,
    ScenarioResultsView,
)
from apiapp.domains.workflow.views import TaskManagementView, WorkersStatusView

urlpatterns = [
    path("scenarios/create/", ScenarioCreateView.as_view(), name="scenario-create"),
    path("scenarios/all/", ScenarioListView.as_view(), name="scenarios-all"),
    path("scenarios/run/<int:scenario_id>/", RunScenarioView.as_view(), name="scenario-run"),
    path("scenarios/<int:scenario_id>/start/", RunScenarioView.as_view(), name="scenario-start"),
    path("scenarios/<int:scenario_id>/logs/", ScenarioLogsView.as_view(), name="scenario-logs"),
    path("scenarios/<int:scenario_id>/results/", ScenarioResultsView.as_view(), name="scenario-results"),
    path("scenarios/<int:scenario_id>/delete/", ScenarioDeleteView.as_view(), name="scenario-delete"),
    path("scenarios/workers-status/", WorkersStatusView.as_view(), name="scenario-workers-status"),
    path("scenarios/task/<str:task_id>/", TaskManagementView.as_view(), name="scenario-task"),
    path("components/by-data-source/", ComponentsByDataSourceView.as_view(), name="components-by-data-source"),
]

__all__ = ["urlpatterns"]
