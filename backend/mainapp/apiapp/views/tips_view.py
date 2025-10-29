# apps/module_server/views.py
import os, types, inspect
from django.http import HttpResponse, HttpResponseNotFound
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.response import Response

import petex_client.gap as gap
import petex_client.gap_tools as gap_tools
import petex_client.resolve as resolve
from petex_client.server import PetexServer
import pi_client

API_KEY = "supersecret"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
MODULE_PATHS = {
    "petex_client": os.path.join(BASE_DIR, "petex_client"),
    "pi_client": os.path.join(BASE_DIR, "pi_client"),
}

@csrf_exempt
def get_module(request, path):
    """Serve .py files for petex_client and pi_client packages."""
    # client_key = request.headers.get("X-API-Key")
    # if API_KEY and client_key != API_KEY:
    #     return HttpResponse("Unauthorized", status=401)

    parts = path.split("/", 1)
    if not parts or parts[0] not in MODULE_PATHS:
        return HttpResponseNotFound("Unknown package")

    package_root = MODULE_PATHS[parts[0]]
    relative_path = parts[1] if len(parts) > 1 else "__init__.py"
    file_path = os.path.join(package_root, relative_path)

    # ✅ Handle package directory paths
    if os.path.isdir(file_path):
        file_path = os.path.join(file_path, "__init__.py")

    # ✅ Add .py if missing
    if not file_path.endswith(".py") and not os.path.isdir(file_path):
        file_path += ".py"

    if not os.path.exists(file_path):
        return HttpResponseNotFound(f"Module not found: {path}")

    with open(file_path, "r", encoding="utf-8") as f:
        code = f.read()

    return HttpResponse(code, content_type="text/plain")

# # --------------------------------------------------------------
# 🔹 Petex / PI function inspector endpoint
# --------------------------------------------------------------
@api_view(["GET"])
def list_petex_functions(request):
    """Return all available Petex & PI client functions/classes as JSON."""

    # Define only what you want to expose
    modules = {
        "gap": gap,
        "gap_tools": gap_tools,
        "resolve": resolve,
        "srv": PetexServer,
        # expose only value() and series() from pi_client
        "pi": types.SimpleNamespace(
            value=pi_client.value,
            series=pi_client.series,
        ),
    }

    result = {}

    for mod_name, mod in modules.items():
        entries = {}

        # ----------------------------------------------------------
        # Functions at the top level of the module or namespace
        # ----------------------------------------------------------
        for name, obj in inspect.getmembers(mod, inspect.isfunction):
            try:
                sig = str(inspect.signature(obj))
            except (ValueError, TypeError):
                sig = "()"
            doc = inspect.getdoc(obj) or ""
            entries[name] = {
                "kind": "function",
                "signature": f"{name}{sig}",
                "doc": doc.split("\n")[0],
            }

        # ----------------------------------------------------------
        # Classes and their methods
        # ----------------------------------------------------------
        for cname, cobj in inspect.getmembers(mod, inspect.isclass):
            methods = {}
            for mname, mobj in inspect.getmembers(cobj, inspect.isfunction):
                try:
                    msig = str(inspect.signature(mobj))
                except (ValueError, TypeError):
                    msig = "()"
                mdoc = inspect.getdoc(mobj) or ""
                methods[mname] = {
                    "signature": f"{mname}{msig}",
                    "doc": mdoc.split("\n")[0],
                }

            entries[cname] = {
                "kind": "class",
                "methods": methods,
                "doc": (inspect.getdoc(cobj) or "").split("\n")[0],
            }

        result[mod_name] = entries
        
    return Response(result)
