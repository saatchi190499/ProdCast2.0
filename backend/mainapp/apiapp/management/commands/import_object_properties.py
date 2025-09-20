import pandas as pd
from django.core.management.base import BaseCommand
from apiapp.models import ObjectType, ObjectTypeProperty, UnitCategory
from django.conf import settings
import os

class Command(BaseCommand):
    help = "Import GAP OS Commands into ObjectTypeProperty table"

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            type=str,
            default=os.path.join(settings.BASE_DIR, 'apiapp', 'management', 'commands', 'data', 'GAP_OS_Commands.xlsx'),
            help="Path to the Excel file",
        )

    def handle(self, *args, **options):
        file_path = options["file"]
        df = pd.read_excel(file_path)

        created_count = 0
        skipped_count = 0

        for _, row in df.iterrows():
            try:
                object_type_name = row.get("Equipment")
                property_name = row.get("Parameter")
                category = row.get("SubSection") or "General"
                openserver = row.get("OS")
                unit_category_name = row.get("UnitCategoryFinal")

                # Пропускаем пустые
                if pd.isna(property_name):
                    continue

                # Найти ObjectType
                try:
                    obj_type = ObjectType.objects.get(object_type_name=object_type_name)
                except ObjectType.DoesNotExist:
                    self.stdout.write(
                        self.style.WARNING(f"ObjectType not found: {object_type_name}")
                    )
                    skipped_count += 1
                    continue

                # Найти UnitCategory
                unit_category = None
                if unit_category_name and unit_category_name != "Unknown":
                    unit_category = UnitCategory.objects.filter(
                        unit_category_name__iexact=unit_category_name
                    ).first()

                # Создать или обновить
                otp, created = ObjectTypeProperty.objects.update_or_create(
                    object_type=obj_type,
                    object_type_property_name=property_name,
                    defaults={
                        "object_type_property_category": category,
                        "openserver": openserver,
                        "unit_category": unit_category,
                    },
                )
                if created:
                    created_count += 1

            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"Error processing row {row.to_dict()}: {e}")
                )
                skipped_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Import completed. Created {created_count}, Skipped {skipped_count}"
            )
        )
