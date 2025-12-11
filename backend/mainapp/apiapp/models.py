"""
Domain models regrouped by service boundaries.
This module re-exports per-domain models to preserve existing imports and app labels.
"""

from apiapp.domains.catalog.models import (  # noqa: F401
    UnitSystem,
    UnitType,
    UnitDefinition,
    UnitCategory,
    UnitSystemCategoryDefinition,
    ObjectType,
    ObjectInstance,
    ObjectTypeProperty,
    GapNetworkData,
)
from apiapp.domains.data.models import DataSource, DataSourceComponent, MainClass  # noqa: F401
from apiapp.domains.scenario.models import ScenarioClass, ScenarioLog, ScenarioComponentLink  # noqa: F401
from apiapp.domains.workflow.models import (  # noqa: F401
    Workflow,
    WorkflowScheduler,
    WorkflowSchedulerLog,
    WorkflowRun,
)
from apiapp.domains.analytics.models import VisualAnalysisConfig  # noqa: F401

__all__ = [
    "UnitSystem",
    "UnitType",
    "UnitDefinition",
    "UnitCategory",
    "UnitSystemCategoryDefinition",
    "ObjectType",
    "ObjectInstance",
    "ObjectTypeProperty",
    "GapNetworkData",
    "DataSource",
    "DataSourceComponent",
    "MainClass",
    "ScenarioClass",
    "ScenarioLog",
    "ScenarioComponentLink",
    "Workflow",
    "WorkflowScheduler",
    "WorkflowSchedulerLog",
    "WorkflowRun",
    "VisualAnalysisConfig",
]
