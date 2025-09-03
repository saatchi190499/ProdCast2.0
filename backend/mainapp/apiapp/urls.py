from .views.login_view import LDAPLoginView
from .views.admin_view import UserListView, change_user_role
from .views.me_view import MeView
from .views.scenario_components_view import *
from .views.scenario_view import *
from .views.object_meta_data_view import *
from .views.unit_view import *
from .views.run_calculation_view import *

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

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
    path("components/<int:component_id>/events/", EventRecordsView.as_view()),

    path("object-metadata/", ObjectMetadataView.as_view()),
    path("unit-system-property-mapping/", UnitSystemPropertyMappingView.as_view()),

    path('scenarios/create/', ScenarioCreateView.as_view(), name='scenario-create'),
    path('scenarios/all/', ScenarioListView.as_view(), name='scenarios-all'),
    path('components/by-data-source/', ComponentsByDataSourceView.as_view(), name='components-by-data-source'),

    path("scenarios/<int:scenario_id>/start/", RunCalculationView.as_view(), name="start-scenario"),
    path("scenarios/<int:scenario_id>/logs/", ScenarioLogsView.as_view(), name="scenario-logs"),
    path("workers/schedule/", workers_schedule_view),

    #path("task-status/<str:task_id>/", get_task_status),
]
