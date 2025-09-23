import json

def block_to_python_from_cells(cells: list) -> str:
    """Convert custom cells JSON → plain Python script"""
    lines = []
    for c in cells:
        if c["type"] == "code":
            lines.append(c.get("source", ""))
        elif c["type"] == "variable":
            for v in c.get("metadata", {}).get("variables", []):
                lines.append(f"{v['name']} = {v['value']}")
        elif c["type"] == "function":
            params = ", ".join(p["name"] for p in c.get("metadata", {}).get("params", []))
            body = c.get("metadata", {}).get("body", "pass")
            lines.append(f"def {c['metadata']['name']}({params}):\n    {body}")
        elif c["type"] == "loop":
            idx = c["metadata"].get("indexVar", "i")
            cnt = c["metadata"].get("count", 5)
            body = c["metadata"].get("body", "pass")
            lines.append(f"for {idx} in range({cnt}):\n    {body}")
        elif c["type"] == "condition":
            cond = c["metadata"].get("condition", "True")
            lines.append(f"if {cond}:\n    pass")
    return "\n\n".join(lines)


def cells_to_ipynb(cells: list) -> str:
    """Convert custom cells JSON → Jupyter Notebook (.ipynb)"""
    nb_cells = []

    for c in cells:
        if c["type"] == "code":
            nb_cells.append({
                "cell_type": "code",
                "metadata": {},
                "execution_count": None,
                "outputs": [],
                "source": [c.get("source", "")]
            })
        else:
            # turn into markdown with python snippet
            text = f"### {c['type'].title()} Cell\n```python\n"
            if c["type"] == "variable":
                for v in c.get("metadata", {}).get("variables", []):
                    text += f"{v['name']} = {v['value']}\n"
            elif c["type"] == "function":
                params = ", ".join(p["name"] for p in c.get("metadata", {}).get("params", []))
                body = c.get("metadata", {}).get("body", "pass")
                text += f"def {c['metadata']['name']}({params}):\n    {body}\n"
            elif c["type"] == "loop":
                idx = c["metadata"].get("indexVar", "i")
                cnt = c["metadata"].get("count", 5)
                body = c["metadata"].get("body", "pass")
                text += f"for {idx} in range({cnt}):\n    {body}\n"
            elif c["type"] == "condition":
                cond = c["metadata"].get("condition", "True")
                text += f"if {cond}:\n    pass\n"
            text += "```"

            nb_cells.append({
                "cell_type": "markdown",
                "metadata": {},
                "source": [text]
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

    return json.dumps(notebook, indent=2)
