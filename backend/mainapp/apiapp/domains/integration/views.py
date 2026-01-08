import inspect
import io
import json
import os
import types
from contextlib import redirect_stderr, redirect_stdout

from apiapp.domains.integration import pi_client
from apiapp.domains.integration.petex_client import gap, gap_tools, resolve
from apiapp.domains.integration.petex_client.server import PetexServer
from django.http import HttpResponse, HttpResponseNotFound
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.response import Response

API_KEY = "supersecret"
BASE_DIR = os.path.dirname(__file__)
MODULE_PATHS = {
    "petex_client": os.path.join(BASE_DIR, "petex_client"),
    "pi_client": os.path.join(BASE_DIR, "pi_client"),
}


_srv_instance = None


def get_srv():
    global _srv_instance

    if _srv_instance is None:
        _srv_instance = PetexServer()
        _srv_instance.__enter__()
    else:
        try:
            if not hasattr(_srv_instance, "_server") or _srv_instance._server is None:
                raise Exception("COM not initialized")
            _ = _srv_instance._server.GetTypeInfoCount()
        except Exception:
            try:
                _srv_instance.close()
            except Exception:
                pass
            _srv_instance = PetexServer()
            _srv_instance.__enter__()

    return _srv_instance


GLOBAL_CONTEXT = {
    "gap": gap,
    "gap_tools": gap_tools,
    "resolve": resolve,
    "PetexServer": PetexServer,
}


@csrf_exempt
def get_module(request, path):
    parts = path.split("/", 1)
    if not parts or parts[0] not in MODULE_PATHS:
        return HttpResponseNotFound("Unknown package")

    package_root = MODULE_PATHS[parts[0]]
    relative_path = parts[1] if len(parts) > 1 else "__init__.py"
    file_path = os.path.join(package_root, relative_path)

    if os.path.isdir(file_path):
        file_path = os.path.join(file_path, "__init__.py")

    if not file_path.endswith(".py") and not os.path.isdir(file_path):
        file_path += ".py"

    if not os.path.exists(file_path):
        return HttpResponseNotFound(f"Module not found: {path}")

    with open(file_path, "r", encoding="utf-8") as f:
        code = f.read()

    return HttpResponse(code, content_type="text/plain")


@api_view(["GET"])
def list_petex_functions(request):
    modules = {
        "gap": gap,
        "gap_tools": gap_tools,
        "resolve": resolve,
        "srv": PetexServer,
        "pi": types.SimpleNamespace(
            value=pi_client.value,
            series=pi_client.series,
        ),
    }

    result = {}

    for mod_name, mod in modules.items():
        entries = {}

        for name, obj in inspect.getmembers(mod, inspect.isfunction):
            try:
                sig = str(inspect.signature(obj))
            except (ValueError, TypeError):
                sig = "()"
            doc = inspect.getdoc(obj) or ""
            entries[name] = {"kind": "function", "signature": f"{name}{sig}", "doc": doc.split("\n")[0]}

        for cname, cobj in inspect.getmembers(mod, inspect.isclass):
            methods = {}
            for mname, mobj in inspect.getmembers(cobj, inspect.isfunction):
                try:
                    msig = str(inspect.signature(mobj))
                except (ValueError, TypeError):
                    msig = "()"
                mdoc = inspect.getdoc(mobj) or ""
                methods[mname] = {"signature": f"{mname}{msig}", "doc": mdoc.split("\n")[0]}

            entries[cname] = {
                "kind": "class",
                "methods": methods,
                "doc": (inspect.getdoc(cobj) or "").split("\n")[0],
            }

        result[mod_name] = entries

    return Response(result)


@api_view(["POST"])
def run_cell(request):
    code = request.data.get("code", "")

    stdout_buf, stderr_buf = io.StringIO(), io.StringIO()

    try:
        GLOBAL_CONTEXT["srv"] = get_srv()
        with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
            exec(code, GLOBAL_CONTEXT)
    except Exception as e:
        stderr_buf.write(f"{type(e).__name__}: {e}\n")

    vars_snapshot = {
        k: {"type": type(v).__name__, "preview": str(v)[:50]}
        for k, v in GLOBAL_CONTEXT.items()
        if not k.startswith("__")
        and not callable(v)
        and not isinstance(v, type)
        and k not in {"gap", "resolve", "PetexServer", "srv"}
    }

    return Response({"stdout": stdout_buf.getvalue(), "stderr": stderr_buf.getvalue(), "variables": vars_snapshot})


@api_view(["POST"])
def run_all(request):
    cells = request.data.get("cells", [])

    stdout_buf, stderr_buf = io.StringIO(), io.StringIO()

    try:
        GLOBAL_CONTEXT["srv"] = get_srv()
        with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
            for code in cells:
                exec(code, GLOBAL_CONTEXT)
    except Exception as e:
        stderr_buf.write(f"{type(e).__name__}: {e}\n")

    vars_snapshot = {
        k: {"type": type(v).__name__, "preview": str(v)[:50]}
        for k, v in GLOBAL_CONTEXT.items()
        if not k.startswith("__")
        and not callable(v)
        and not isinstance(v, type)
        and k not in {"gap", "resolve", "PetexServer", "srv"}
    }

    return Response({"stdout": stdout_buf.getvalue(), "stderr": stderr_buf.getvalue(), "variables": vars_snapshot})


@api_view(["GET"])
def list_variables(request):
    reserved = {"gap", "resolve", "PetexServer", "srv"}
    result = {}

    for k, v in GLOBAL_CONTEXT.items():
        if k.startswith("__") or k in reserved or callable(v) or isinstance(v, type):
            continue

        try:
            t = type(v).__name__
            preview = str(v)
            if len(preview) > 80:
                preview = preview[:77] + "..."
            result[k] = {"type": t, "preview": preview}
        except Exception:
            result[k] = {"type": "unknown", "preview": ""}

    return Response(result)


@api_view(["POST"])
def reset_context(request):
    GLOBAL_CONTEXT.clear()
    GLOBAL_CONTEXT.update(
        {
            "gap": gap,
            "resolve": resolve,
            "PetexServer": PetexServer,
            "srv": get_srv(),
        }
    )
    return Response({"status": "reset"})


@api_view(["POST"])
def delete_var(request):
    name = request.data.get("name")
    if name and name in GLOBAL_CONTEXT:
        del GLOBAL_CONTEXT[name]
    return Response({"status": "ok", "deleted": name})


@api_view(["POST"])
def set_var(request):
    name = request.data.get("name")
    value = request.data.get("value")
    vtype = request.data.get("type", "str")

    try:
        if vtype == "int":
            value = int(value)
        elif vtype == "float":
            value = float(value)
        elif vtype == "bool":
            value = value.lower() in ("1", "true", "yes")
        else:
            value = str(value)

        GLOBAL_CONTEXT[name] = value
        return Response({"status": "ok", "name": name, "value": value})
    except Exception as e:
        return Response({"status": "error", "msg": str(e)}, status=400)


__all__ = [
    "run_cell",
    "run_all",
    "reset_context",
    "list_variables",
    "delete_var",
    "set_var",
    "get_module",
    "list_petex_functions",
    "get_srv",
]
