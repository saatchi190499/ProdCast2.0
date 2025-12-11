from django.urls import include, path

urlpatterns = [
    path("", include("apiapp.domains.identity.urls")),
    path("", include("apiapp.domains.catalog.urls")),
    path("", include("apiapp.domains.data.urls")),
    path("", include("apiapp.domains.scenario.urls")),
    path("", include("apiapp.domains.workflow.urls")),
    path("", include("apiapp.domains.analytics.urls")),
    path("", include("apiapp.domains.integration.urls")),
]


__all__ = ["urlpatterns"]
