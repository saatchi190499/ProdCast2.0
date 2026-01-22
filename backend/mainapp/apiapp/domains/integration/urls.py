from django.urls import path

from apiapp.domains.integration.views import (
    get_module,
)

urlpatterns = [
    path("module/<path:path>", get_module, name="get_module"),
]

__all__ = ["urlpatterns"]
