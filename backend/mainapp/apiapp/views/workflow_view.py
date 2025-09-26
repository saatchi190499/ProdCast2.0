
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.conf import settings
from pathlib import Path
from datetime import datetime
import nbformat
import os

from ..models import Workflow, ScenarioComponent
from ..serializers import WorkflowSerializer, WorkflowListSerializer
from ..utils.notebook_converter import block_to_python, python_to_block  


def workflow_version_path(workflow, ext="py"):
    """
    Build a versioned path like workflows/12/12_2025-09-23T17-45-01.py
    """
    ts = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    return os.path.join("workflows", str(workflow.id), f"{workflow.id}_{ts}.{ext}")


class WorkflowViewSet(viewsets.ModelViewSet):
    queryset = Workflow.objects.all()
    serializer_class = WorkflowSerializer
    lookup_field = "component_id"   # URLs use /components/workflows/<component_id>/

    def get_object(self):
        """Always return a Workflow for the given component, creating it if missing."""
        component_id = self.kwargs.get("component_id")
        component = get_object_or_404(ScenarioComponent, pk=component_id)
        workflow, _ = Workflow.objects.get_or_create(component=component)
        return workflow
    
    #list all workflows
    @action(detail=False, methods=["get"], url_path="all")
    def list_all(self, request):
        workflows = Workflow.objects.select_related("component").all()
        serializer = WorkflowListSerializer(workflows, many=True)
        return Response(serializer.data)
    
    # 🔹 List available versions
    @action(detail=True, methods=["get"], url_path="versions")
    def versions(self, request, component_id=None):
        wf = self.get_object()
        base = Path(settings.MEDIA_ROOT) / "workflows" / str(wf.id)
        versions = []

        if base.exists():
            for f in base.glob(f"{wf.id}_*.py"):
                ts = f.stem.split("_", 1)[1]
                versions.append(ts)

        active = ""
        if wf.code_file:
            try:
                active = Path(wf.code_file.name).stem.split("_", 1)[1]
            except Exception:
                active = ""

        return Response({
            "versions": sorted(versions, reverse=True),  # newest first
            "active": active
        })


    # 🔹 Load one version back into cells
    @action(detail=True, methods=["get"], url_path="load_version")
    def load_version(self, request, component_id=None):
        workflow = self.get_object()
        ts = request.query_params.get("timestamp")
        if not ts:
            return Response({"error": "timestamp required"}, status=400)

        ipynb_path = Path(settings.MEDIA_ROOT) / "workflows" / str(workflow.id) / f"{workflow.id}_{ts}.ipynb"
        if not ipynb_path.exists():
            return Response({"error": "Version not found"}, status=404)

        nb = nbformat.read(ipynb_path, as_version=4)
        cells = []
        for c in nb.cells:
            if c.cell_type == "code":
                src = "".join(c.source)
                block = python_to_block(src)   # ✅ convert Python back → notebook cell
                cells.append(block)

        return Response({"cells": cells})

    # 🔹 Register version → keep only that one
    @action(detail=True, methods=["post"], url_path="register_version")
    def register_version(self, request, component_id=None):
        workflow = self.get_object()
        ts = request.data.get("timestamp")
        if not ts:
            return Response({"error": "timestamp required"}, status=400)

        base_dir = Path(settings.MEDIA_ROOT) / "workflows" / str(workflow.id)
        keep_py = base_dir / f"{workflow.id}_{ts}.py"
        keep_ipynb = base_dir / f"{workflow.id}_{ts}.ipynb"

        if not keep_py.exists() or not keep_ipynb.exists():
            return Response({"error": "Version not found"}, status=404)

        # ✅ Load notebook cells into DB
        nb = nbformat.read(keep_ipynb, as_version=4)
        cells = []
        for c in nb.cells:
            if c.cell_type == "code":
                src = "".join(c.source)
                block = python_to_block(src)  # convert back into structured block
                cells.append(block)

        workflow.cells = cells  # overwrite, not merge
        workflow.code_file.name = str(keep_py.relative_to(Path(settings.MEDIA_ROOT)))
        workflow.ipynb_file.name = str(keep_ipynb.relative_to(Path(settings.MEDIA_ROOT)))
        workflow.save()

        # ✅ Delete old versions
        for f in base_dir.glob(f"{workflow.id}_*.*"):
            if f.stem != f"{workflow.id}_{ts}":
                try:
                    f.unlink()
                except Exception:
                    pass

        return Response({"status": "registered", "timestamp": ts, "cells": workflow.cells})


    # 🔹 Save new notebook snapshot on update
    def perform_update(self, serializer):
        workflow = serializer.save()

        code_lines = []
        nb = nbformat.v4.new_notebook()

        for cell in workflow.cells:
            src = block_to_python(cell)
            code_lines.append(src)
            nb.cells.append(nbformat.v4.new_code_cell(src))

        code_text = "\n\n".join(code_lines)

        # Save .py
        py_path = Path(settings.MEDIA_ROOT) / workflow_version_path(workflow, "py")
        py_path.parent.mkdir(parents=True, exist_ok=True)
        py_path.write_text(code_text, encoding="utf-8")

        # Save .ipynb
        ipynb_path = Path(settings.MEDIA_ROOT) / workflow_version_path(workflow, "ipynb")
        with ipynb_path.open("w", encoding="utf-8") as f:
            nbformat.write(nb, f)

        # Update workflow to latest
        workflow.code_file.name = str(py_path.relative_to(Path(settings.MEDIA_ROOT)))
        workflow.ipynb_file.name = str(ipynb_path.relative_to(Path(settings.MEDIA_ROOT)))
        workflow.save()


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




