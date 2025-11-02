import os
from django.core.management.base import BaseCommand
from apiapp.models import ObjectType, ObjectTypeProperty, UnitCategory

class Command(BaseCommand):
    help = "Create GAP.WELL SolverResults properties with category 'Results'"

    def handle(self, *args, **options):
        data = [
            ("GOR", "GAP.MOD[{PROD}].WELL[{...}].SolverResults[0].GOR", "gas_oil_ratio"),
            ("GasRate", "GAP.MOD[{PROD}].WELL[{...}].SolverResults[0].GasRate", "gas_rate"),
            ("LiquidRate", "GAP.MOD[{PROD}].WELL[{...}].SolverResults[0].LiqRate", "liquid_rate"),
            ("OilRate", "GAP.MOD[{PROD}].WELL[{...}].SolverResults[0].OilRate", "oil_rate"),
            ("ReservoirPressure", "GAP.MOD[{PROD}].WELL[{...}].SolverResults[0].ResPres", "pressure"),
            ("WCT", "GAP.MOD[{PROD}].WELL[{...}].SolverResults[0].WCT", "percent"),
            ("WHPressure", "GAP.MOD[{PROD}].WELL[{...}].SolverResults[0].FWHP", "pressure"),
            ("WHTemperature", "GAP.MOD[{PROD}].WELL[{...}].SolverResults[0].OtherResult[15]", "temperature"),
        ]

        # Найдём тип оборудования "WELL"
        try:
            obj_type = ObjectType.objects.get(object_type_name="WELL")
        except ObjectType.DoesNotExist:
            self.stdout.write(self.style.ERROR("❌ ObjectType 'WELL' not found"))
            return

        created_count = 0
        updated_count = 0

        for name, os_cmd, unit in data:
            # Проверим или создадим UnitCategory
            unit_cat, _ = UnitCategory.objects.get_or_create(
                unit_category_name=unit,
                defaults={"unit_category_description": f"{unit} auto-created"},
            )

            otp, created = ObjectTypeProperty.objects.update_or_create(
                object_type=obj_type,
                object_type_property_name=name,
                defaults={
                    "object_type_property_category": "Results",  # 👈 фиксированная категория
                    "openserver": os_cmd,
                    "unit_category": unit_cat,
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"✅ Import completed. Created: {created_count}, Updated: {updated_count}"
            )
        )