import base64
import urllib.parse
import requests
from requests_kerberos import HTTPKerberosAuth, OPTIONAL
import urllib3
import pandas as pd
# 🔇 Отключаем предупреждение о self-signed SSL
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 🔼 Генерирует WebID из raw пути (уже URL-кодированного или без него — не важно)
def generate_web_id_raw(raw_encoded_path: str, id_type: str = 'Attributes') -> str:
    web_id_type = 'P'
    web_id_version = '1'
    markers = {
        'Attributes': 'Ab',
        'pipoint': 'DP',
        'unit': 'Ut'
    }
    web_id_base = 'E' if id_type == 'Attributes' else ''
    encoded = base64.b64encode(raw_encoded_path.encode('utf-8')).decode('utf-8')
    encoded = encoded.replace('+', '-').replace('/', '_').rstrip('=')
    return f"{web_id_type}{web_id_version}{markers[id_type]}{web_id_base}{encoded}"

# 🌐 Получение значения по времени
def get_value_at_time(web_id, iso_time_str):
    time_param = urllib.parse.quote(iso_time_str)
    url = f"https://kpcpdw08/piwebapi/streams/{web_id}/value?time={time_param}"

    print("📡 Запрос:", url)

    response = requests.get(
        url,
        auth=HTTPKerberosAuth(mutual_authentication=OPTIONAL),
        verify=False
    )

    if response.status_code == 200:
        return response.json()
    else:
        print(f"❌ Error {response.status_code}: {response.text}")
        return None

BASE_URL = "https://kpcpdw08/piwebapi"


from typing import Optional

def get_time_series(
    web_id: str,
    start_time: str,
    end_time: str,
    interval: Optional[str] = None,
    max_count: int = 100_000,
):
    """
    Читает данные PI Web API.
    - interval=None ➜ сырые значения (/recorded)
    - interval='1h', '5m' … ➜ интерполированные (/interpolated)
    Возвращает DataFrame ['Timestamp', 'Value'] без индекса-даты.
    """
    if interval:
        # интерполированные
        url = (
            f"{BASE_URL}/streams/{web_id}/interpolated"
            f"?startTime={start_time}&endTime={end_time}"
            f"&interval={interval}&selectedFields=Items.Timestamp;Items.Value"
        )
        resp = requests.get(url,
                            auth=HTTPKerberosAuth(mutual_authentication=OPTIONAL),
                            verify=False)
        resp.raise_for_status()
        items = resp.json().get("Items", [])

    else:
        # сырые recorded (с пагинацией)
        url = (
            f"{BASE_URL}/streams/{web_id}/recorded"
            f"?startTime={start_time}&endTime={end_time}"
            f"&maxCount={max_count}&selectedFields=Items.Timestamp;Items.Value"
        )
        items = []
        while url:
            resp = requests.get(url,
                                auth=HTTPKerberosAuth(mutual_authentication=OPTIONAL),
                                verify=False)
            resp.raise_for_status()
            data = resp.json()
            items.extend(data.get("Items", []))
            url = data.get("Links", {}).get("NextPage")  # None ➜ закончились страницы

    # формируем DataFrame
    return pd.DataFrame(
        {
            "Timestamp": pd.to_datetime([i["Timestamp"] for i in items]),
            "Value":     [i["Value"] for i in items],
        }
    )



