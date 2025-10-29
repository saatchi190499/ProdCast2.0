import tempfile, os
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from petex_client import gap
from petex_client.server import PetexServer
from ..models import ObjectType, ObjectInstance
from django.db import transaction

class UpdateInstancesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            file_obj = request.FILES.get("gap_file")
            if not file_obj:
                return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

            import tempfile, os
            with tempfile.NamedTemporaryFile(delete=False, suffix=".gap") as tmp:
                for chunk in file_obj.chunks():
                    tmp.write(chunk)
                gap_path = tmp.name

            try:
                from petex_client import gap_tools
                from ..models import GapNetworkData
                with PetexServer() as srv:
                    gap.start(srv)
                    gap.open_file(srv, gap_path)
                    equips = update_equip_types_and_instances(srv)

                    # --- Extract topology and save to GapNetworkData globally for each well ---
                    topology = gap_tools.extract_topology(srv)
                    all_branches = topology.get("branches", {})
                    for well_name, paths in topology.get("routes_named", {}).items():
                        # Collect all UIDs in this well's route
                        route_uids = set()
                        for path in paths:
                            route_uids.update([seg["uid"] if isinstance(seg, dict) else seg for seg in path])

                        # Filter branches: only keep pipes that are in the route
                        well_branches = {}
                        for bp, pipes in all_branches.items():
                            filtered_pipes = [pipe for pipe in pipes if (pipe.get("uid") if isinstance(pipe, dict) else pipe) in route_uids]
                            if filtered_pipes:
                                well_branches[bp] = filtered_pipes

                        # Filter trunks: only keep those in the route
                        all_trunks = topology.get("trunks", [])
                        filtered_trunks = [trunk for trunk in all_trunks if (trunk.get("uid") if isinstance(trunk, dict) else trunk) in route_uids]

                        GapNetworkData.objects.create(
                            well_name=well_name,
                            paths=paths,
                            branches=well_branches,
                            trunks=filtered_trunks,
                        )

                    gap.shutdown(srv)
            finally:
                os.remove(gap_path)

            return Response(
                {"message": "Types & Instances updated, topology saved", "data": equips},
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)




def update_equip_types_and_instances(srv: PetexServer):
    """
    Полная синхронизация ObjectType и ObjectInstance по EQUIP из GAP:
    - создаём недостающие типы
    - удаляем лишние типы
    - обновляем список инстансов (новые добавляем, старые удаляем)
    """
    equips = gap.get_all_equips(srv)  # { "Well": ["W1","W2"], "Pipe": ["P1"], ... }
    gap_types = set(equips.keys())

    with transaction.atomic():
        # --- Создаём недостающие типы ---
        obj_types = {}
        for type_name in gap_types:
            obj_type, _ = ObjectType.objects.get_or_create(object_type_name=type_name)
            obj_types[type_name] = obj_type

        # --- Удаляем лишние типы (которых нет в GAP) ---
        ObjectType.objects.exclude(object_type_name__in=gap_types).delete()

        # --- Синхронизация инстансов ---
        for type_name, labels in equips.items():
            obj_type = obj_types[type_name]

            new_instances = set(labels)
            existing = set(
                ObjectInstance.objects.filter(object_type=obj_type)
                .values_list("object_instance_name", flat=True)
            )

            # создаём новые
            for name in new_instances - existing:
                ObjectInstance.objects.create(
                    object_type=obj_type,
                    object_instance_name=name,
                )

            # удаляем лишние
            for name in existing - new_instances:
                ObjectInstance.objects.filter(
                    object_type=obj_type, object_instance_name=name
                ).delete()

    return equips

