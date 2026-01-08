import urllib.parse
from typing import Optional, List, Dict

import pandas as pd
import requests

from .config import BASE_URL, get_auth


def get_value_at_time(web_id: str, iso_time_str: str) -> Optional[Dict]:
    """Fetch a single PI value at a specific time for the given WebID."""
    time_param = urllib.parse.quote(iso_time_str)
    url = f"{BASE_URL}/streams/{web_id}/value?time={time_param}"

    resp = requests.get(url, auth=get_auth(), verify=False)
    if resp.status_code == 200:
        return resp.json()
    return None


def get_time_series(
    web_id: str,
    start_time: str,
    end_time: str,
    interval: Optional[str] = None,
    max_count: int = 100_000,
) -> pd.DataFrame:
    """
    Fetch a PI time series for the given WebID.

    - interval provided -> interpolated
    - interval None     -> recorded
    Returns a DataFrame with ["Timestamp", "Value"].
    """
    if interval:
        url = (
            f"{BASE_URL}/streams/{web_id}/interpolated"
            f"?startTime={start_time}&endTime={end_time}"
            f"&interval={interval}&selectedFields=Items.Timestamp;Items.Value"
        )
        resp = requests.get(url, auth=get_auth(), verify=False)
        resp.raise_for_status()
        items: List[Dict] = resp.json().get("Items", [])
    else:
        url = (
            f"{BASE_URL}/streams/{web_id}/recorded"
            f"?startTime={start_time}&endTime={end_time}"
            f"&maxCount={max_count}&selectedFields=Items.Timestamp;Items.Value"
        )
        items = []
        while url:
            resp = requests.get(url, auth=get_auth(), verify=False)
            resp.raise_for_status()
            data = resp.json()
            items.extend(data.get("Items", []))
            url = data.get("Links", {}).get("NextPage")

    return pd.DataFrame(
        {
            "Timestamp": pd.to_datetime([i.get("Timestamp") for i in items]),
            "Value": [i.get("Value") for i in items],
        }
    )

