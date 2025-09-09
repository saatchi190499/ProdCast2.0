from django.core.management.base import BaseCommand
from apiapp.models import DataSource, ObjectType, ObjectInstance
from django.contrib.auth.models import Group

class Command(BaseCommand):
    help = "Initialize default DataSources and ObjectTypes"

    def handle(self, *args, **kwargs):
        for name in ["Models", "Events"]:
            DataSource.objects.get_or_create(data_source_name=name)

        for name in ["WELL", "PIPE", "SOURCE"]:
            ObjectType.objects.get_or_create(object_type_name=name)

        # --- Default Groups ---
        for group_name in ["admin", "user", "guest"]:
            Group.objects.get_or_create(name=group_name)

        # Example ObjectInstances
        well_type = ObjectType.objects.get(object_type_name="WELL")
        for instance_name in ["Well-1", "Well-2", "Well-3", "Well-4", "Well-5"]:
            ObjectInstance.objects.get_or_create(object_type=well_type, object_instance_name=instance_name)

        self.stdout.write(self.style.SUCCESS("Default data initialized!"))
