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
    """
    Retrieve a single PI value for a tag or WebID.

    Parameters:
        tag_or_web_id (str): Tag name or WebID of the PI point or attribute.
        time (str): Timestamp or time expression (default: "*").
        id_type (str): ID type used by lookup ("Attributes" or "Elements").

    Returns:
        dict | None: Latest or time-specific value as JSON dict.

    Uses:
        pi.value("WELL1-FLP")
        → {'Timestamp': '2025-10-29T08:00:00Z', 'Value': 12.34}
    """
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
    """
    Retrieve a PI time series between start and end times.

    Parameters:
        tag_or_web_id (str)# Tag name or WebID of the PI point or attribute.
        start (str)# Start time expression ("t-1d", "2025-10-01T00:00:00Z").
        end (str)# End time expression ("*", "t", "2025-10-29T00:00:00Z").
        interval (str, optional)# Sampling interval ("1h", "15m", etc.).
        id_type (str)# ID type used by lookup ("Attributes" or "Elements").
        max_count (int)# Maximum number of points to return.

    Returns:
        pd.DataFrame: DataFrame with Timestamp and Value columns.

    Uses:
        pi.series("WELL1-FLP", "t-1d", "*", interval="1h")
        → DataFrame([{'Timestamp': ..., 'Value': ...}, ...])
    """
    wid = _to_web_id(tag_or_web_id, id_type=id_type)
    return get_time_series(wid, start, end, interval=interval, max_count=max_count)

