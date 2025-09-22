import inspect
from rest_framework.decorators import api_view
from rest_framework.response import Response

# Import your Petex client wrappers
import petex_client.gap as gap
import petex_client.resolve as resolve
from petex_client.server import PetexServer


@api_view(["GET"])
def list_petex_functions(request):
    modules = {
        "gap": gap,
        "resolve": resolve,
        "srv": PetexServer # auto-opened sessionF
    }

    result = {}

    for mod_name, mod in modules.items():
        entries = {}

        # 🔹 Top-level functions
        for name, obj in inspect.getmembers(mod, inspect.isfunction):
            sig = str(inspect.signature(obj))
            doc = inspect.getdoc(obj) or ""
            entries[name] = {
                "kind": "function",
                "signature": f"{name}{sig}",
                "doc": doc.split("\n")[0],
            }

        # 🔹 Classes and their methods
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
