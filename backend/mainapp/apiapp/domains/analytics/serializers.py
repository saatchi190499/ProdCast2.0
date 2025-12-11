from rest_framework import serializers

from apiapp.domains.analytics.models import VisualAnalysisConfig


class VisualAnalysisConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = VisualAnalysisConfig
        fields = ["id", "component", "charts", "updated_at"]
        read_only_fields = ["id", "updated_at"]


__all__ = ["VisualAnalysisConfigSerializer"]
