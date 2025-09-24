import re
import uuid

LABEL_RE = re.compile(r"^#\s*(.+?)\s+Cell\s*$", re.IGNORECASE)

def _strip_first_indent_block(src: str) -> str:
    lines = src.splitlines()
    if not lines:
        return ""
    # remove first line and unindent following "    " if present
    after = lines[1:]
    unindented = [(l[4:] if l.startswith("    ") else l) for l in after]
    return "\n".join(unindented).rstrip()

def _parse_simple_assignments(src: str):
    """
    Parse simple a = <expr> lines, preserving RHS exactly (no escaping/changes).
    Returns list[ {name, type:"any", value:str} ] or None if any line doesn't match.
    """
    vars_ = []
    for raw in src.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#"):
            continue
        # Only 1 '=' and looks like a python identifier on LHS
        if line.count("=") != 1:
            return None
        lhs, rhs = [p.strip() for p in line.split("=", 1)]
        if not re.match(r"^[A-Za-z_]\w*$", lhs):
            return None
        # Keep RHS exactly as-is
        vars_.append({"name": lhs, "type": "any", "value": rhs})
    return vars_

def python_to_block(src: str) -> dict:
    """
    Convert ONE code cell's source string -> your notebook block.
    Rules:
      - If the first line is '# <Label> Cell', use that label, and if the
        label starts with 'Variable', 'Function', 'Loop', 'Condition', use that type.
      - Without an explicit label, only classify function/loop/condition by clear starters.
        Never auto-classify 'variable' unless explicitly labeled.
      - Preserve code exactly for code cells.
    """
    text = src.rstrip("\n")
    lines = text.splitlines()

    label = "Cell"
    explicit_type = None

    if lines and lines[0].lstrip().startswith("#"):
        m = LABEL_RE.match(lines[0].strip())
        if m:
            # label text before the word 'Cell'
            label_text = m.group(1).strip()
            label = label_text or "Cell"
            # Try to infer explicit type from label prefix
            lt = label_text.lower()
            if lt.startswith("variable"):
                explicit_type = "variable"
            elif lt.startswith("function"):
                explicit_type = "function"
            elif lt.startswith("loop"):
                explicit_type = "loop"
            elif lt.startswith("condition"):
                explicit_type = "condition"
            elif lt.startswith("code"):
                explicit_type = "code"
            # remove the label line from body
            lines = lines[1:]

    body = "\n".join(lines).rstrip()

    # --- Respect explicit type if given -------------------------------------
    if explicit_type == "function":
        # def name(params):  body...
        # Keep as function only if it really starts with def
        if body.startswith("def "):
            m = re.match(r"def\s+(\w+)\((.*?)\):", body)
            name = m.group(1) if m else "func"
            params_str = m.group(2) if m else ""
            params = []
            if params_str:
                for p in params_str.split(","):
                    p = p.strip()
                    if not p:
                        continue
                    if "=" in p:
                        k, v = p.split("=", 1)
                        params.append({"name": k.strip(), "type": "any", "default": v.strip()})
                    else:
                        params.append({"name": p, "type": "any", "default": ""})
            func_body = _strip_first_indent_block(body)
            return {
                "id": str(uuid.uuid4()),
                "type": "function",
                "label": label,
                "metadata": {"name": name, "params": params, "body": func_body},
            }
        # If it doesn't look like a def, fall back to code
        explicit_type = "code"

    if explicit_type == "loop":
        if body.startswith("for "):
            m = re.match(r"for\s+(\w+)\s+in\s+range\((\d+)\):", body)
            idx = m.group(1) if m else "i"
            count = int(m.group(2)) if m else 5
            loop_body = _strip_first_indent_block(body)
            return {
                "id": str(uuid.uuid4()),
                "type": "loop",
                "label": label,
                "metadata": {"indexVar": idx, "count": count, "body": loop_body},
            }
        explicit_type = "code"

    if explicit_type == "condition":
        if body.startswith("if "):
            m = re.match(r"if\s+(.+):", body)
            cond = m.group(1).strip() if m else "True"
            return {
                "id": str(uuid.uuid4()),
                "type": "condition",
                "label": label,
                "metadata": {"condition": cond},
            }
        explicit_type = "code"

    if explicit_type == "variable":
        vars_ = _parse_simple_assignments(body)
        if vars_ is not None:
            return {
                "id": str(uuid.uuid4()),
                "type": "variable",
                "label": label,
                "metadata": {"variables": vars_},
            }
        # fall back to code if not strictly simple assignments
        explicit_type = "code"

    # --- No explicit type: classify only def/for/if; otherwise keep as code --
    if body.startswith("def "):
        m = re.match(r"def\s+(\w+)\((.*?)\):", body)
        name = m.group(1) if m else "func"
        params_str = m.group(2) if m else ""
        params = []
        if params_str:
            for p in params_str.split(","):
                p = p.strip()
                if not p:
                    continue
                if "=" in p:
                    k, v = p.split("=", 1)
                    params.append({"name": k.strip(), "type": "any", "default": v.strip()})
                else:
                    params.append({"name": p, "type": "any", "default": ""})
        func_body = _strip_first_indent_block(body)
        return {
            "id": str(uuid.uuid4()),
            "type": "function",
            "label": label,
            "metadata": {"name": name, "params": params, "body": func_body},
        }

    if body.startswith("for "):
        m = re.match(r"for\s+(\w+)\s+in\s+range\((\d+)\):", body)
        idx = m.group(1) if m else "i"
        count = int(m.group(2)) if m else 5
        loop_body = _strip_first_indent_block(body)
        return {
            "id": str(uuid.uuid4()),
            "type": "loop",
            "label": label,
            "metadata": {"indexVar": idx, "count": count, "body": loop_body},
        }

    if body.startswith("if "):
        m = re.match(r"if\s+(.+):", body)
        cond = m.group(1).strip() if m else "True"
        return {
            "id": str(uuid.uuid4()),
            "type": "condition",
            "label": label,
            "metadata": {"condition": cond},
        }

    # default → code cell; preserve text EXACTLY
    return {
        "id": str(uuid.uuid4()),
        "type": "code",
        "label": label,
        "metadata": {},
        "source": body,
    }
