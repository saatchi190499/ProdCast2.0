from __future__ import annotations

from typing import Iterable, Optional, Sequence

from django.db.models import Q, QuerySet
from django.utils.dateparse import parse_datetime
from django.utils import timezone

from apiapp.domains.catalog.models import ObjectInstance, ObjectType, ObjectTypeProperty
from apiapp.domains.data.models import DataSourceComponent, MainClass, MainClassHistory


ComponentLike = DataSourceComponent | int | str | dict
ObjectTypeLike = ObjectType | int | str | dict
ObjectInstanceLike = ObjectInstance | int | str | dict
ObjectTypePropertyLike = ObjectTypeProperty | int | str | dict


def _split_ids_names(
    items: Iterable[ComponentLike | ObjectTypeLike | ObjectInstanceLike],
    id_keys: Sequence[str],
    name_keys: Sequence[str],
) -> tuple[list[int], list[str]]:
    ids: list[int] = []
    names: list[str] = []

    for item in items:
        if item is None:
            continue

        if isinstance(item, dict):
            found = False
            for key in id_keys:
                if key in item and item[key] is not None:
                    ids.append(int(item[key]))
                    found = True
                    break
            if found:
                continue
            for key in name_keys:
                if key in item and item[key]:
                    names.append(str(item[key]))
                    found = True
                    break
            if found:
                continue
            raise ValueError(f"Unsupported dict for selection: {item}")

        if hasattr(item, "pk"):
            ids.append(int(item.pk))
            continue

        if isinstance(item, int):
            ids.append(item)
            continue

        if isinstance(item, str):
            if item.isdigit():
                ids.append(int(item))
            else:
                names.append(item)
            continue

        raise ValueError(f"Unsupported selection item: {item!r}")

    return sorted(set(ids)), sorted(set(names))


def _apply_id_name_filter(qs: QuerySet, id_field: str, name_field: str, ids: list[int], names: list[str]) -> QuerySet:
    if ids and names:
        return qs.filter(Q(**{f"{id_field}__in": ids}) | Q(**{f"{name_field}__in": names}))
    if ids:
        return qs.filter(**{f"{id_field}__in": ids})
    if names:
        return qs.filter(**{f"{name_field}__in": names})
    return qs


def get_components(
    components: Optional[Iterable[ComponentLike]] = None,
    *,
    as_queryset: bool = False,
) -> list[dict] | QuerySet:
    """
    Return Internal data source components, optionally filtered by id/name.
    """
    qs = DataSourceComponent.objects.filter(data_source__data_source_name__iexact="Internal")

    if components:
        ids, names = _split_ids_names(components, id_keys=("id", "component_id"), name_keys=("name", "component_name"))
        qs = _apply_id_name_filter(qs, "id", "name", ids, names)

    if as_queryset:
        return qs

    return list(
        qs.values(
            "id",
            "name",
            "internal_mode",
            "data_source_id",
            "data_source__data_source_name",
        ).order_by("name")
    )


def get_records(
    components: Optional[Iterable[ComponentLike]] = None,
    object_type: Optional[ObjectTypeLike | Iterable[ObjectTypeLike]] = None,
    instances: Optional[Iterable[ObjectInstanceLike]] = None,
    properties: Optional[Iterable[ObjectTypePropertyLike]] = None,
    *,
    order_by: Optional[Sequence[str]] = None,
    as_queryset: bool = False,
) -> list[dict] | QuerySet:
    """
    Fetch Internal records filtered by component(s), object type, and instance group.
    """
    qs = MainClass.objects.select_related(
        "component",
        "object_type",
        "object_instance",
        "object_type_property",
    ).filter(component__data_source__data_source_name__iexact="Internal")

    if components:
        ids, names = _split_ids_names(components, id_keys=("id", "component_id"), name_keys=("name", "component_name"))
        qs = _apply_id_name_filter(qs, "component_id", "component__name", ids, names)

    if object_type is not None:
        obj_items = object_type if isinstance(object_type, (list, tuple, set)) else [object_type]
        ids, names = _split_ids_names(obj_items, id_keys=("id", "object_type_id"), name_keys=("name", "object_type_name"))
        qs = _apply_id_name_filter(qs, "object_type_id", "object_type__object_type_name", ids, names)

    if instances:
        ids, names = _split_ids_names(
            instances,
            id_keys=("id", "object_instance_id"),
            name_keys=("name", "object_instance_name"),
        )
        qs = _apply_id_name_filter(qs, "object_instance_id", "object_instance__object_instance_name", ids, names)

    if properties:
        ids, names = _split_ids_names(
            properties,
            id_keys=("id", "object_type_property_id"),
            name_keys=("name", "object_type_property_name"),
        )
        qs = _apply_id_name_filter(
            qs,
            "object_type_property_id",
            "object_type_property__object_type_property_name",
            ids,
            names,
        )

    if order_by:
        qs = qs.order_by(*order_by)
    else:
        qs = qs.order_by("component_id", "object_instance__object_instance_name", "object_type_property__object_type_property_name")

    if as_queryset:
        return qs

    return list(
        qs.values(
            "data_set_id",
            "component_id",
            "component__name",
            "object_type_id",
            "object_type__object_type_name",
            "object_instance_id",
            "object_instance__object_instance_name",
            "object_type_property_id",
            "object_type_property__object_type_property_name",
            "value",
            "date_time",
            "tag",
            "description",
        )
    )


def get_history(
    components: Optional[Iterable[ComponentLike]] = None,
    object_type: Optional[ObjectTypeLike | Iterable[ObjectTypeLike]] = None,
    instances: Optional[Iterable[ObjectInstanceLike]] = None,
    properties: Optional[Iterable[ObjectTypePropertyLike]] = None,
    *,
    start: Optional[str] = None,
    end: Optional[str] = None,
    as_queryset: bool = False,
) -> list[dict] | QuerySet:
    """
    Fetch Internal history rows filtered by component(s), object type, and instance group.
    """
    records = get_records(
        components=components,
        object_type=object_type,
        instances=instances,
        properties=properties,
        as_queryset=True,
    )
    record_ids = records.values_list("data_set_id", flat=True)
    qs = MainClassHistory.objects.select_related("main_record").filter(main_record_id__in=record_ids)

    if start:
        dt = parse_datetime(start)
        if dt:
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt, timezone.get_current_timezone())
            qs = qs.filter(time__gte=dt)
    if end:
        dt = parse_datetime(end)
        if dt:
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt, timezone.get_current_timezone())
            qs = qs.filter(time__lte=dt)

    qs = qs.order_by("time")

    if as_queryset:
        return qs

    return list(
        qs.values(
            "id",
            "main_record_id",
            "time",
            "value",
            "main_record__object_type_id",
            "main_record__object_instance_id",
            "main_record__object_type_property_id",
        )
    )

__all__ = ["get_components", "get_records", "get_history"]
