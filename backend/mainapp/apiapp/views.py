"""
Aggregate all API views in a single module for backward compatibility.
Each view lives in its domain module; this file just re-exports them.
"""

from apiapp.domains.identity.views import LDAPLoginView, MeView, UserListView, change_user_role
from apiapp.domains.catalog.views import (
    GapNetworkDataListView,
    ObjectInstanceListView,
    ObjectMetadataView,
    UnitSystemPropertyMappingView,
    UpdateInstancesView,
    update_equip_types_and_instances,
)
from apiapp.domains.data.views import (
    DataSourceComponentCreateView,
    DataSourceComponentDetailView,
    DataSourceComponentsBySourceView,
    DataSourceListView,
    DeclineCurvesView,
    EventRecordsView,
    PIRecordsView,
    fetch_pi_value_for_component_row,
    pi_history_for_component_row,
)
from apiapp.domains.scenario.views import (
    ComponentsByDataSourceView,
    RunScenarioView,
    ScenarioCreateView,
    ScenarioDeleteView,
    ScenarioListView,
    ScenarioLogsView,
    ScenarioResultsView,
)
from apiapp.domains.workflow.views import (
    RunWorkflowSchedulesView,
    TaskManagementView,
    WorkersStatusView,
    WorkflowRunViewSet,
    WorkflowSchedulerLogViewSet,
    WorkflowSchedulerViewSet,
    WorkflowViewSet,
)
from apiapp.domains.integration.views import (
    delete_var,
    get_module,
    get_srv,
    list_petex_functions,
    list_variables,
    reset_context,
    run_all,
    run_cell,
    set_var,
)

__all__ = [
    # identity
    "LDAPLoginView",
    "MeView",
    "UserListView",
    "change_user_role",
    # catalog
    "GapNetworkDataListView",
    "ObjectInstanceListView",
    "ObjectMetadataView",
    "UnitSystemPropertyMappingView",
    "UpdateInstancesView",
    "update_equip_types_and_instances",
    # data
    "DataSourceComponentCreateView",
    "DataSourceComponentDetailView",
    "DataSourceComponentsBySourceView",
    "DataSourceListView",
    "DeclineCurvesView",
    "EventRecordsView",
    "PIRecordsView",
    "fetch_pi_value_for_component_row",
    "pi_history_for_component_row",
    # scenario
    "ComponentsByDataSourceView",
    "RunScenarioView",
    "ScenarioCreateView",
    "ScenarioDeleteView",
    "ScenarioListView",
    "ScenarioLogsView",
    "ScenarioResultsView",
    # workflow
    "RunWorkflowSchedulesView",
    "TaskManagementView",
    "WorkersStatusView",
    "WorkflowRunViewSet",
    "WorkflowSchedulerLogViewSet",
    "WorkflowSchedulerViewSet",
    "WorkflowViewSet",
    # integration
    "delete_var",
    "get_module",
    "get_srv",
    "list_petex_functions",
    "list_variables",
    "reset_context",
    "run_all",
    "run_cell",
    "set_var",
]
