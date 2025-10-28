from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from apiapp.models import DataSourceComponent, MainClass
from apiapp.utils.pi_utils import generate_web_id_raw, get_value_at_time, get_time_series
import pandas as pd


@api_view(["POST"])
def fetch_pi_value_for_component_row(request, component_id, row_id):
    """
    Fetch one PI value for a specific MainClass row (belonging to a PI component).
    Example: POST /components/pi-records/5/row/42/fetch_value/
    Body: { "time": "2025-10-09T00:00:00Z" }
    """
    try:
        component = DataSourceComponent.objects.get(id=component_id)
        row = MainClass.objects.get(
            component=component,
            pk=row_id,
        )

        if not row.tag:
            return Response({"error": "Row has no PI tag"}, status=400)

        iso_time_str = request.data.get("time") or timezone.now().isoformat()
        web_id = generate_web_id_raw(row.tag, id_type="Attributes")
        result = get_value_at_time(web_id, iso_time_str)

        if not result or "Value" not in result:
            return Response({"error": "No PI value found"}, status=404)

        value = result["Value"]
        timestamp = result.get("Timestamp", iso_time_str)
        row.value = value
        row.date_time = pd.to_datetime(timestamp)
        row.save(update_fields=["value", "date_time"])

        return Response({
            "id": row.data_set_id,
            "tag": row.tag,
            "value": value,
            "date_time": row.date_time.isoformat(),
        })

    except MainClass.DoesNotExist:
        return Response({"error": "Row not found for this component"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)


@api_view(["GET"])
def pi_history_for_component_row(request, component_id, row_id):
    """
    Fetch full PI time series for a row within a specific PI component.
    Example: /components/pi-records/5/row/42/history/?start=2025-10-01T00:00:00Z&end=2025-10-09T00:00:00Z
    """
    try:
        component = DataSourceComponent.objects.get(id=component_id)
        row = MainClass.objects.get(
            component=component,
            pk=row_id,
        )

        if not row.tag:
            return Response({"error": "No tag for this row"}, status=400)

        start = request.GET.get("start", "2024-06-03T00:00:00Z")
        end = request.GET.get("end", "2025-06-10T00:00:00Z")
        interval = request.GET.get("interval", "1h")

        web_id = generate_web_id_raw(row.tag, id_type="Attributes")
        df = get_time_series(web_id, start, end, interval)

        return Response(df.to_dict(orient="records"))

    except MainClass.DoesNotExist:
        return Response({"error": "Row not found for this component"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)
    
