from .views.login_view import LDAPLoginView
from .views.admin_view import UserListView, change_user_role
from .views.me_view import MeView
from .views.scenario_components_view import *
from .views.object_meta_data_view import *
from .views.unit_view import *

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

]
