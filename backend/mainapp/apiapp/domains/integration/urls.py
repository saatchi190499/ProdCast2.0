from django.urls import path

from apiapp.domains.integration.views import (
    delete_var,
    get_module,
    list_petex_functions,
    list_variables,
    reset_context,
    run_all,
    run_cell,
    set_var,
)

urlpatterns = [
    path("run_cell/", run_cell, name="run-cell"),
    path("run_all/", run_all, name="run-all"),
    path("reset_context/", reset_context),
    path("variables/", list_variables),
    path("petex/introspect/", list_petex_functions, name="petex-introspect"),
    path("module/<path:path>", get_module, name="get_module"),
    path("delete_var/", delete_var, name="delete-var"),
    path("set_var/", set_var, name="set-var"),
]

__all__ = ["urlpatterns"]
