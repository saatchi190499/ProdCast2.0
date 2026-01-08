import base64


def generate_web_id_raw(raw_encoded_path: str, id_type: str = "Attributes") -> str:
    """
    Build a PI Web API WebID from a raw-encoded path.

    Parameters:
    - raw_encoded_path: The raw path string that PI Web API expects (before WebID).
    - id_type: One of "Attributes", "pipoint", or "unit".

    Returns:
    - WebID string usable with PI Web API stream endpoints.
    """
    web_id_type = "P"
    web_id_version = "1"
    markers = {
        "Attributes": "Ab",
        "pipoint": "DP",
        "unit": "Ut",
    }
    web_id_base = "E" if id_type == "Attributes" else ""
    encoded = base64.b64encode(raw_encoded_path.encode("utf-8")).decode("utf-8")
    encoded = encoded.replace("+", "-").replace("/", "_").rstrip("=")
    return f"{web_id_type}{web_id_version}{markers[id_type]}{web_id_base}{encoded}"

