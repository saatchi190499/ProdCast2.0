import inspect
from rest_framework.decorators import api_view
from rest_framework.response import Response

# Import your Petex client wrappers
import petex_client.gap as gap
import petex_client.gap_tools as gap_tools
import petex_client.resolve as resolve
from petex_client.server import PetexServer
import pi_client
import types


@api_view(["GET"])
def list_petex_functions(request):
    modules = {
        "gap": gap,
        "gap_tools" : gap_tools,
        "resolve": resolve,
        "srv": PetexServer,  # auto-opened session
        # PI helpers: expose only selected functions for tips
        "pi": types.SimpleNamespace(
            value=pi_client.value,
            series=pi_client.series,
        ),
    }

    result = {}

    for mod_name, mod in modules.items():
        entries = {}

        # Top-level functions
        for name, obj in inspect.getmembers(mod, inspect.isfunction):
            sig = str(inspect.signature(obj))
            doc = inspect.getdoc(obj) or ""
            entries[name] = {
                "kind": "function",
                "signature": f"{name}{sig}",
                "doc": doc.split("\n")[0],
            }

        # Classes and their methods
        for cname, cobj in inspect.getmembers(mod, inspect.isclass):
            methods = {}
            for mname, mobj in inspect.getmembers(cobj, inspect.isfunction):
                try:
                    msig = str(inspect.signature(mobj))
                except ValueError:
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

