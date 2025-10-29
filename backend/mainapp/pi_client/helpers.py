from typing import Optional

import pandas as pd

from .webid import generate_web_id_raw
from .streams import get_value_at_time, get_time_series


def _to_web_id(tag_or_web_id: str, id_type: str = "Attributes") -> str:
    """Return a WebID, passing through if input already looks like one."""
    if isinstance(tag_or_web_id, str) and len(tag_or_web_id) > 2 and tag_or_web_id[0] == "P":
        return tag_or_web_id
    return generate_web_id_raw(str(tag_or_web_id), id_type=id_type)


def value(tag_or_web_id: str, time: str = "*", id_type: str = "Attributes"):
    """High-level helper: fetch a single PI value as JSON dict or None."""
    wid = _to_web_id(tag_or_web_id, id_type=id_type)
    return get_value_at_time(wid, time)


def series(
    tag_or_web_id: str,
    start: str,
    end: str,
    interval: Optional[str] = None,
    id_type: str = "Attributes",
    max_count: int = 100_000,
) -> pd.DataFrame:
    """High-level helper: fetch a PI time series as a DataFrame."""
    wid = _to_web_id(tag_or_web_id, id_type=id_type)
    return get_time_series(wid, start, end, interval=interval, max_count=max_count)

