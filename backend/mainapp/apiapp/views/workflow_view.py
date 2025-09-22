import json
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from ..models import ScenarioComponent, Workflow
from ..serializers import WorkflowSerializer

class WorkflowRecordsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, component_id):
        component = get_object_or_404(
            ScenarioComponent,
            id=component_id,
            data_source__data_source_name="Workflows"  # 👈 follow FK
        )

        workflow, _ = Workflow.objects.get_or_create(component=component)
        serializer = WorkflowSerializer(workflow, context={"request": request})
        return Response(serializer.data)

    def put(self, request, component_id):
        component = get_object_or_404(
            ScenarioComponent,
            id=component_id,
            data_source__data_source_name="Workflows"  # 👈 follow FK
        )

        workflow, _ = Workflow.objects.get_or_create(component=component)
        serializer = WorkflowSerializer(workflow, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
import io
from contextlib import redirect_stdout, redirect_stderr
from rest_framework.decorators import api_view
from rest_framework.response import Response

# preload Petex modules
import petex_client.gap as gap
import petex_client.resolve as resolve
from petex_client.server import PetexServer



# 🔹 Global singleton for COM session
_srv_instance = None


def get_srv():
    """Return a live PetexServer instance, reconnecting if necessary."""
    global _srv_instance

    if _srv_instance is None:
        _srv_instance = PetexServer()
        _srv_instance.__enter__()   # open COM session
    else:
        try:
            # 🔹 Probe COM connection (cheap call)
            if not hasattr(_srv_instance, "_server") or _srv_instance._server is None:
                raise Exception("COM not initialized")
            _ = _srv_instance._server.GetTypeInfoCount()  # minimal COM check
        except Exception:
            # 🔹 Reconnect if dead
            try:
                _srv_instance.close()
            except Exception:
                pass
            _srv_instance = PetexServer()
            _srv_instance.__enter__()

    return _srv_instance


# 🔹 Persistent global context (Jupyter-like kernel)
GLOBAL_CONTEXT = {
    "gap": gap,
    "resolve": resolve,
    "PetexServer": PetexServer,
    # note: srv injected dynamically per execution
}


@api_view(["POST"])
def run_cell(request):
    code = request.data.get("code", "")

    stdout_buf, stderr_buf = io.StringIO(), io.StringIO()

    try:
        # Always ensure srv is in context
        GLOBAL_CONTEXT["srv"] = get_srv()

        with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
            exec(code, GLOBAL_CONTEXT)
    except Exception as e:
        stderr_buf.write(f"{type(e).__name__}: {e}\n")

    # Collect variables (skip builtins, modules, functions/classes)
    vars_snapshot = {
        k: {
            "type": type(v).__name__,
            "preview": str(v)[:50],
        }
        for k, v in GLOBAL_CONTEXT.items()
        if not k.startswith("__")
        and not callable(v)
        and not isinstance(v, type)   # skip classes
        and k not in {"gap", "resolve", "PetexServer", "srv"}  # skip modules/server
    }

    return Response({
        "stdout": stdout_buf.getvalue(),
        "stderr": stderr_buf.getvalue(),
        "variables": vars_snapshot,
    })



@api_view(["POST"])
def run_all(request):
    """Executes a list of cells sequentially in persistent GLOBAL_CONTEXT."""
    cells = request.data.get("cells", [])

    stdout_buf, stderr_buf = io.StringIO(), io.StringIO()

    try:
        GLOBAL_CONTEXT["srv"] = get_srv()
        with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
            for code in cells:
                exec(code, GLOBAL_CONTEXT)
    except Exception as e:
        stderr_buf.write(f"{type(e).__name__}: {e}\n")

    # Same variable snapshot logic as run_cell
    vars_snapshot = {
        k: {"type": type(v).__name__, "preview": str(v)[:50]}
        for k, v in GLOBAL_CONTEXT.items()
        if not k.startswith("__")
        and not callable(v)
        and not isinstance(v, type)
        and k not in {"gap", "resolve", "PetexServer", "srv"}
    }

    return Response({
        "stdout": stdout_buf.getvalue(),
        "stderr": stderr_buf.getvalue(),
        "variables": vars_snapshot,
    })


@api_view(["GET"])
def list_variables(request):
    """Return only user-defined variables (exclude Petex modules and reserved)."""
    reserved = {"gap", "resolve", "PetexServer", "srv"}
    result = {}

    for k, v in GLOBAL_CONTEXT.items():
        if (
            k.startswith("__")        # skip internals
            or k in reserved          # skip Petex/system objects
            or callable(v)            # skip functions
            or isinstance(v, type)    # skip classes
        ):
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
    """Clear user variables but keep Petex modules."""
    GLOBAL_CONTEXT.clear()
    GLOBAL_CONTEXT.update({
        "gap": gap,
        "resolve": resolve,
        "PetexServer": PetexServer,
        "srv": get_srv(),
    })
    return Response({"status": "reset"})

@api_view(["POST"])
def delete_var(request):
    """Delete a single variable from context."""
    name = request.data.get("name")
    if name and name in GLOBAL_CONTEXT:
        del GLOBAL_CONTEXT[name]
    return Response({"status": "ok", "deleted": name})

@api_view(["POST"])
def set_var(request):
    """Create or update a variable in GLOBAL_CONTEXT"""
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
            # fallback to string
            value = str(value)

        GLOBAL_CONTEXT[name] = value
        return Response({"status": "ok", "name": name, "value": value})
    except Exception as e:
        return Response({"status": "error", "msg": str(e)}, status=400)




