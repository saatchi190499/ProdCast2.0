import json

def block_to_python(cell):
    t = cell.get("type")
    label = (cell.get("label") or t.title()).strip()

    # remove duplicate "Cell" if user added manually
    if not label.lower().endswith("cell"):
        label = f"{label} Cell"

    if t == "variable":
        body = "\n".join(f"{v['name']} = {v['value']}" for v in cell["metadata"].get("variables", []))
        return f"# {label}\n{body}"

    if t == "function":
        params = ", ".join(p["name"] for p in cell["metadata"].get("params", []))
        body = cell["metadata"].get("body", "pass")
        return f"# {label}\ndef {cell['metadata'].get('name','func')}({params}):\n    {body}"

    if t == "loop":
        return f"# {label}\nfor {cell['metadata'].get('indexVar','i')} in range({cell['metadata'].get('count',5)}):\n    {cell['metadata'].get('body','pass')}"

    if t == "condition":
        return f"# {label}\nif {cell['metadata'].get('condition','True')}:\n    pass"

    if t == "code":
        return f"# {label}\n{cell.get('source','')}"

    return "# Unknown cell type"

import re
import uuid

def python_to_block(src: str) -> dict:
    lines = src.strip().split("\n")
    label = "Cell"

    # detect label comment like "# MyLabel Cell"
    if lines and lines[0].startswith("#") and "Cell" in lines[0]:
        label = re.sub(r"#\s*|\s*Cell", "", lines[0]).strip()
        lines = lines[1:]

    body = "\n".join(lines)

    # --- function cell ---
    if body.startswith("def "):
        m = re.match(r"def\s+(\w+)\((.*?)\):", body)
        name = m.group(1) if m else "func"
        params_str = m.group(2) if m else ""
        params = []
        if params_str:
            for p in params_str.split(","):
                p = p.strip()
                if "=" in p:
                    k, v = p.split("=", 1)
                    params.append({"name": k.strip(), "type": "any", "default": v.strip()})
                else:
                    params.append({"name": p, "type": "any", "default": ""})
        func_body = "\n".join(
            l[4:] if l.startswith("    ") else l for l in body.split("\n")[1:]
        )
        return {
            "id": str(uuid.uuid4()),
            "type": "function",
            "label": label,
            "metadata": {"name": name, "params": params, "body": func_body},
        }

    # --- loop cell ---
    if body.startswith("for "):
        m = re.match(r"for\s+(\w+)\s+in\s+range\((\d+)\):", body)
        idx = m.group(1) if m else "i"
        count = int(m.group(2)) if m else 5
        loop_body = "\n".join(
            l[4:] if l.startswith("    ") else l for l in body.split("\n")[1:]
        )
        return {
            "id": str(uuid.uuid4()),
            "type": "loop",
            "label": label,
            "metadata": {"indexVar": idx, "count": count, "body": loop_body},
        }

    # --- condition cell ---
    if body.startswith("if "):
        m = re.match(r"if\s+(.+):", body)
        cond = m.group(1).strip() if m else "True"
        return {
            "id": str(uuid.uuid4()),
            "type": "condition",
            "label": label,
            "metadata": {"condition": cond},
        }

    # --- variable cell ---
    if "=" in body and "==" not in body:
        vars_ = []
        for line in body.splitlines():
            if "=" in line:
                name, val = line.split("=", 1)
                vars_.append(
                    {"name": name.strip(), "type": "any", "value": val.strip()}
                )
        return {
            "id": str(uuid.uuid4()),
            "type": "variable",
            "label": label,
            "metadata": {"variables": vars_},
        }

    # --- default → code cell ---
    return {
        "id": str(uuid.uuid4()),
        "type": "code",
        "label": label,
        "metadata": {},
        "source": body,
    }


def cells_to_ipynb(cells: list) -> dict:
    """Convert custom cells JSON → Jupyter Notebook dict"""
    nb_cells = []

    for c in cells:
        src = block_to_python(c)  # always use the same exporter
        nb_cells.append({
            "cell_type": "code",
            "metadata": {
                "label": c.get("label") or c["type"].title()
            },
            "execution_count": None,
            "outputs": [],
            "source": [src]
        })

    notebook = {
        "cells": nb_cells,
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3"
            },
            "language_info": {
                "name": "python",
                "version": "3.x"
            }
        },
        "nbformat": 4,
        "nbformat_minor": 5
    }
    return notebook

