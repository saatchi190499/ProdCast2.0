from django.urls import path

from apiapp.domains.analytics.views import VisualAnalysisConfigView

urlpatterns = [
    path("components/visual-analysis/<int:component_id>/config/", VisualAnalysisConfigView.as_view()),
]

__all__ = ["urlpatterns"]
