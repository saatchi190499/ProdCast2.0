
from ..models import  Workflow
from ..serializers import WorkflowSerializer

from rest_framework import viewsets
from ..models import  workflow_code_path
from django.conf import settings
from ..utils.notebook_export import block_to_python
from ..utils.notebook_import import python_to_block

from pathlib import Path
import nbformat
from rest_framework.decorators import action
import os
from datetime import datetime

def workflow_version_path(workflow, ext="py"):
    """
    Build a versioned path like workflows/12/12_2025-09-23T17-45-01.py
    """
    ts = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    return os.path.join("workflows", str(workflow.id), f"{workflow.id}_{ts}.{ext}")

class WorkflowViewSet(viewsets.ModelViewSet):
    queryset = Workflow.objects.all()
    serializer_class = WorkflowSerializer

    # list available versions
    @action(detail=True, methods=["get"])
    def versions(self, request, pk=None):
        workflow = self.get_object()
        base_path = Path(settings.MEDIA_ROOT) / "workflows" / str(workflow.id)
        versions = sorted({f.stem.split("_")[-1] for f in base_path.glob(f"{workflow.id}_*.py")})
        return Response({"versions": versions})


    # register → keep only this version
    @action(detail=True, methods=["post"])
    def register_version(self, request, pk=None):
        workflow = self.get_object()
        ts = request.data.get("timestamp")
        base_dir = Path(settings.MEDIA_ROOT) / "workflows" / str(workflow.id)
        keep_py = base_dir / f"{workflow.id}_{ts}.py"
        keep_ipynb = base_dir / f"{workflow.id}_{ts}.ipynb"

        # clean old versions
        for f in base_dir.glob(f"{workflow.id}_*.*"):
            if f.stem != f"{workflow.id}_{ts}":
                try: f.unlink()
                except Exception: pass

        # update workflow pointers
        workflow.code_file.name = str(keep_py.relative_to(settings.MEDIA_ROOT))
        workflow.ipynb_file.name = str(keep_ipynb.relative_to(settings.MEDIA_ROOT))
        workflow.save()

        return Response({"status": "registered", "timestamp": ts})

    @action(detail=True, methods=["get"])
    def load_version(self, request, pk=None):
        workflow = self.get_object()
        ts = request.query_params.get("timestamp")

        # build version path
        base_path = Path(settings.MEDIA_ROOT) / "workflows" / str(workflow.id)
        ipynb_path = base_path / f"{workflow.id}_{ts}.ipynb"

        if not ipynb_path.exists():
            return Response({"error": "Version not found"}, status=404)

        nb = nbformat.read(ipynb_path, as_version=4)

        cells = []
        for c in nb.cells:
            if c.cell_type == "code":
                src = "".join(c.source)
                block = python_to_block(src)   # ✅ convert Python → cell
                cells.append(block)

        return Response({"cells": cells})
    
    @action(detail=True, methods=["post"])
    def register_notebook(self, request, pk=None):
        workflow = self.get_object()
        timestamp = request.data.get("timestamp")
        if not timestamp:
            return Response({"error": "timestamp required"}, status=400)

        base_path = Path(settings.MEDIA_ROOT) / "workflows" / str(workflow.id)
        py_path = base_path / f"{workflow.id}_{timestamp}.py"
        ipynb_path = base_path / f"{workflow.id}_{timestamp}.ipynb"

        if not py_path.exists() or not ipynb_path.exists():
            return Response({"error": "Version not found"}, status=404)

        # ✅ Register these as active
        workflow.code_file.name = str(py_path.relative_to(Path(settings.MEDIA_ROOT)))
        workflow.ipynb_file.name = str(ipynb_path.relative_to(Path(settings.MEDIA_ROOT)))
        workflow.save()

        # ✅ Delete old ones except current
        for f in base_path.glob(f"{workflow.id}_*.*"):
            if f.stem not in {py_path.stem, ipynb_path.stem}:
                try:
                    f.unlink()
                except Exception:
                    pass

        return Response({
            "message": "Notebook registered",
            "py_file": workflow.code_file.url,
            "ipynb_file": workflow.ipynb_file.url,
        })

    def perform_update(self, serializer):
        workflow = serializer.save()

        code_lines = []
        nb = nbformat.v4.new_notebook()

        for cell in workflow.cells:
            src = block_to_python(cell)
            code_lines.append(src)
            nb.cells.append(nbformat.v4.new_code_cell(src))

        code_text = "\n\n".join(code_lines)

        py_path = Path(settings.MEDIA_ROOT) / workflow_version_path(workflow, "py")
        py_path.parent.mkdir(parents=True, exist_ok=True)
        py_path.write_text(code_text, encoding="utf-8")

        ipynb_path = Path(settings.MEDIA_ROOT) / workflow_version_path(workflow, "ipynb")
        with ipynb_path.open("w", encoding="utf-8") as f:
            nbformat.write(nb, f)   



##########################################################################

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




