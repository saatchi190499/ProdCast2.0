from .views.login_view import LDAPLoginView
from .views.admin_view import UserListView, change_user_role
from .views.me_view import MeView
from .views.scenario_components_view import *
from .views.scenario_view import *
from .views.object_meta_data_view import *
from .views.unit_view import *
from .views.run_calculation_view import *
from .views.workflow_view import *
from .views.petex_view import *
from .views.update_gap_instance_view import *
from .views.server_view import *
from .views.workflow_schduler_view import *


from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from rest_framework.routers import DefaultRouter


router = DefaultRouter()
router.register(r"components/workflows", WorkflowViewSet, basename="workflow")
router.register(r"servers", ServerViewSet, basename="servers")
router.register(r"workflow-schedulers", WorkflowSchedulerViewSet, basename="workflow-schedulers")
router.register(r"workflow-scheduler-logs", WorkflowSchedulerLogViewSet, basename="workflow-scheduler-logs")
router.register(r'workflow-runs', WorkflowRunViewSet, basename='workflow-runs')

urlpatterns = [
    

    path('login/', LDAPLoginView.as_view()),
    path("me/", MeView.as_view(), name="me"),

    path("users/", UserListView.as_view()),
    path("users/<int:user_id>/role/", change_user_role),

    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),


    path("data-sources/", DataSourceListView.as_view(), name="data-sources"),
    
    path("data-sources/<str:source_name>/components/", ScenarioComponentsBySourceView.as_view()),
    path("components/", ScenarioComponentCreateView.as_view(), name="components-create"),
    path("components/<int:pk>/", ScenarioComponentDetailView.as_view()),
    path("components/events/<int:component_id>", EventRecordsView.as_view()),
    path("", include(router.urls)),

    path("object-metadata/", ObjectMetadataView.as_view()),
    path("object-instances/", ObjectInstanceListView.as_view(), name="object-instances"),
    path("update-instances/", UpdateInstancesView.as_view(), name="update-instances"),
    path("unit-system-property-mapping/", UnitSystemPropertyMappingView.as_view()),

    path('scenarios/create/', ScenarioCreateView.as_view(), name='scenario-create'),
    path('scenarios/all/', ScenarioListView.as_view(), name='scenarios-all'),
    path('components/by-data-source/', ComponentsByDataSourceView.as_view(), name='components-by-data-source'),

    path("scenarios/<int:scenario_id>/start/", RunCalculationView.as_view(), name="start-scenario"),
    path("scenarios/<int:scenario_id>/logs/", ScenarioLogsView.as_view(), name="scenario-logs"),
    path("workers/schedule/", workers_schedule_view),


    path("run_cell/", run_cell, name="run-cell"),
    path("run_all/", run_all, name="run-cell"),
    path("reset_context/", reset_context),
    path("variables/", list_variables),
    # path("functions/", list_functions),
    path("petex/introspect/", list_petex_functions, name="petex-introspect"),
    path("delete_var/", delete_var, name="petex-introspect"),
    path("set_var/", set_var, name="petex-introspect"),

    #path("task-status/<str:task_id>/", get_task_status),
]
