from django.core.management.base import BaseCommand
from apiapp.models import DataSource, ObjectType, ObjectInstance

class Command(BaseCommand):
    help = "Initialize default DataSources and ObjectTypes"

    def handle(self, *args, **kwargs):
        for name in ["Models", "Events"]:
            DataSource.objects.get_or_create(data_source_name=name)

        for name in ["WELL", "PIPE", "SOURCE"]:
            ObjectType.objects.get_or_create(object_type_name=name)

        # Example ObjectInstances
        well_type = ObjectType.objects.get(object_type_name="WELL")
        for instance_name in ["Well-1", "Well-2"]:
            ObjectInstance.objects.get_or_create(object_type=well_type, object_instance_name=instance_name)

        self.stdout.write(self.style.SUCCESS("Default data initialized!"))
