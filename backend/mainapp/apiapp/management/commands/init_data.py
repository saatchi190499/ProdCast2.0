from django.core.management.base import BaseCommand
from apiapp.models import DataSource, ObjectType, ObjectInstance
from django.contrib.auth.models import Group

class Command(BaseCommand):
    help = "Initialize default DataSources, ObjectTypes, ObjectInstances, and Groups"

    def handle(self, *args, **kwargs):
        # --- DataSources (с типами) ---
        data_sources = [
            ("Models", "FORECAST"),
            ("Events", "FORECAST"),
            ("Decline Curves", "FORECAST"),
            ("PI System", "SOURCE"),
            ("Workflows", "WORKFLOW"),
            ("VisualAnalysis", "VISUAL"),
        ]
        for name, dtype in data_sources:
            DataSource.objects.get_or_create(
                data_source_name=name,
                defaults={"data_source_type": dtype}
            )

        # --- Default Groups ---
        for group_name in ["admin", "user", "guest"]:
            Group.objects.get_or_create(name=group_name)

        for type_name in ["PIPE", "WELL", "SEP", "INLGEN"]:
            obj_type, created = ObjectType.objects.get_or_create(
                object_type_name=type_name
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"✅ ObjectType '{type_name}' created."))

            

        self.stdout.write(self.style.SUCCESS("✅ Default data with types initialized!"))
