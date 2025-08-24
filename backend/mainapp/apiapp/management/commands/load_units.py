# your_project_name/apiapp/management/commands/import_units.py

import os
from datetime import datetime
from decimal import Decimal
import pandas as pd # Import pandas to handle .xlsx files

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.conf import settings # Import settings to get BASE_DIR

from apiapp.models import (
    UnitSystem,
    UnitType,
    UnitDefinition,
    UnitCategory,
    UnitSystemCategoryDefinition,
    # Add other models here if you have CSVs for them and want to import
    # DataSource, ObjectType, ObjectInstance, ObjectTypeProperty, MainClass,
)

class Command(BaseCommand):
    help = 'Imports unit system data from XLSX files into the Django database using pandas.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--path',
            type=str,
            help='The base path to the directory containing the XLSX files. Defaults to <app_root>/data/',
            default=os.path.join(settings.BASE_DIR, 'apiapp', 'data'),
        )

    def handle(self, *args, **options):
        xlsx_path = options['path'] # Renamed for clarity as we're now dealing with XLSX
        self.stdout.write(self.style.SUCCESS(f"Starting data import from path: {xlsx_path}"))

        # Check if the path exists before attempting to open files
        if not os.path.exists(xlsx_path):
            raise CommandError(f"The specified XLSX data path does not exist: {xlsx_path}")
        if not os.path.isdir(xlsx_path):
            raise CommandError(f"The specified XLSX data path is not a directory: {xlsx_path}")

        # Helper function for robust datetime parsing
        def parse_date_robustly(date_raw, field_name):
            if pd.notna(date_raw):
                if isinstance(date_raw, datetime):
                    return date_raw
                elif isinstance(date_raw, str):
                    try:
                        # Attempt to parse with full microseconds
                        return datetime.strptime(date_raw, '%Y-%m-%d %H:%M:%S.%f')
                    except ValueError:
                        # Fallback if microseconds are too long (e.g., '...0270000') or other format
                        parts = date_raw.split('.')
                        if len(parts) > 1 and len(parts[1]) > 6:
                            cleaned_microseconds = parts[1][:6] # Take only first 6 digits
                            cleaned_date_str = f"{parts[0]}.{cleaned_microseconds}"
                            try:
                                return datetime.strptime(cleaned_date_str, '%Y-%m-%d %H:%M:%S.%f')
                            except ValueError:
                                # Fallback if there are no microseconds or different format
                                self.stdout.write(self.style.WARNING(f"  Could not parse {field_name} '{date_raw}' with microseconds, attempting without."))
                                try:
                                    return datetime.strptime(parts[0], '%Y-%m-%d %H:%M:%S')
                                except ValueError as ve:
                                    self.stdout.write(self.style.ERROR(f"  Failed to parse {field_name} '{date_raw}' even after cleaning: {ve}"))
                        else:
                            # If no microseconds or already 6/fewer, try without microseconds part directly
                            try:
                                return datetime.strptime(parts[0], '%Y-%m-%d %H:%M:%S')
                            except ValueError as ve:
                                self.stdout.write(self.style.ERROR(f"  Failed to parse {field_name} '{date_raw}': {ve}"))
                else:
                    self.stdout.write(self.style.WARNING(f"  Unsupported type for {field_name}: {type(date_raw)} for value '{date_raw}'"))
            return None


        # --- Import UnitSystem Data ---
        self.stdout.write(self.style.SUCCESS("Importing UnitSystem data..."))
        unit_system_file = os.path.join(xlsx_path, 'UnitSystem.xlsx')
        try:
            df_unit_system = pd.read_excel(unit_system_file)
            for index, row in df_unit_system.iterrows():
                # Convert -1 for CreatedBy/ModifiedBy to None if they should be null
                # Use .get() for robustness if column might be missing or value is NaN
                created_by = int(row['CreatedBy']) if pd.notna(row.get('CreatedBy')) and str(row['CreatedBy']) != '-1' else None
                modified_by = int(row['ModifiedBy']) if pd.notna(row.get('ModifiedBy')) and str(row['ModifiedBy']) != '-1' else None

                created_date = parse_date_robustly(row['CreatedDate'], 'created_date')
                modified_date = parse_date_robustly(row['ModifiedDate'], 'modified_date')

                obj, created = UnitSystem.objects.update_or_create(
                    unit_system_id=row['UnitSystemId'], # Use ID for lookup if it's stable and unique
                    defaults={
                        'unit_system_name': row['UnitSystemName'],
                        'created_date': created_date,
                        'modified_date': modified_date,
                        'created_by': created_by,
                        'modified_by': modified_by,
                    }
                )
                if created:
                    self.stdout.write(self.style.SUCCESS(f"  Created UnitSystem: {obj.unit_system_name}"))
                else:
                    self.stdout.write(self.style.WARNING(f"  Updated UnitSystem: {obj.unit_system_name}"))
        except FileNotFoundError:
            raise CommandError(f"UnitSystem XLSX file not found at: {unit_system_file}")
        except Exception as e:
            raise CommandError(f"Error importing UnitSystem data: {e}")

        # --- Import UnitType Data ---
        self.stdout.write(self.style.SUCCESS("Importing UnitType data..."))
        unit_type_file = os.path.join(xlsx_path, 'UnitType.xlsx')
        try:
            df_unit_type = pd.read_excel(unit_type_file)
            for index, row in df_unit_type.iterrows():
                created_by = int(row['CreatedBy']) if pd.notna(row.get('CreatedBy')) and str(row['CreatedBy']) != '-1' else None
                modified_by = int(row['ModifiedBy']) if pd.notna(row.get('ModifiedBy')) and str(row['ModifiedBy']) != '-1' else None

                created_date = parse_date_robustly(row['CreatedDate'], 'created_date')
                modified_date = parse_date_robustly(row['ModifiedDate'], 'modified_date')

                obj, created = UnitType.objects.update_or_create(
                    unit_type_id=row['UnitTypeId'],
                    defaults={
                        'unit_type_name': row['UnitTypeName'],
                        'created_date': created_date,
                        'modified_date': modified_date,
                        'created_by': created_by,
                        'modified_by': modified_by,
                    }
                )
                if created:
                    self.stdout.write(self.style.SUCCESS(f"  Created UnitType: {obj.unit_type_name}"))
                else:
                    self.stdout.write(self.style.WARNING(f"  Updated UnitType: {obj.unit_type_name}"))
        except FileNotFoundError:
            raise CommandError(f"UnitType XLSX file not found at: {unit_type_file}")
        except Exception as e:
            raise CommandError(f"Error importing UnitType data: {e}")

        # --- Import UnitDefinition Data ---
        # This depends on UnitType, so UnitType must be imported first
        self.stdout.write(self.style.SUCCESS("Importing UnitDefinition data..."))
        unit_definition_file = os.path.join(xlsx_path, 'UnitDefinition.xlsx')
        try:
            df_unit_definition = pd.read_excel(unit_definition_file)
            for index, row in df_unit_definition.iterrows():
                try:
                    # Fetch related UnitType
                    unit_type = UnitType.objects.get(unit_type_id=row['UnitTypeId'])

                    created_by = int(row['CreatedBy']) if pd.notna(row.get('CreatedBy')) and str(row['CreatedBy']) != '-1' else None
                    modified_by = int(row['ModifiedBy']) if pd.notna(row.get('ModifiedBy')) and str(row['ModifiedBy']) != '-1' else None

                    created_date = parse_date_robustly(row['CreatedDate'], 'created_date')
                    modified_date = parse_date_robustly(row['ModifiedDate'], 'modified_date')

                    obj, created = UnitDefinition.objects.update_or_create(
                        unit_definition_id=row['UnitDefinitionId'],
                        defaults={
                            'unit_definition_name': row['UnitDefinitionName'],
                            'unit_type': unit_type,
                            'scale_factor': Decimal(str(row['ScaleFactor'])) if pd.notna(row.get('ScaleFactor')) else Decimal('0.0'), # Ensure string before Decimal, handle NaN
                            'offset': Decimal(str(row['Offset'])) if pd.notna(row.get('Offset')) else Decimal('0.0'),
                            'is_base': bool(int(row['IsBase'])) if pd.notna(row.get('IsBase')) else False, # Convert 0/1 to False/True, handle None/NaN
                            'alias_text': row['AliasText'] if pd.notna(row.get('AliasText')) else None,
                            'precision': int(row['Precision']) if pd.notna(row.get('Precision')) else 0, # Default to 0 if NaN
                            'created_date': created_date,
                            'modified_date': modified_date,
                            'created_by': created_by,
                            'modified_by': modified_by,
                            'calculation_method': int(row['CalculationMethod']) if pd.notna(row.get('CalculationMethod')) else None,
                        }
                    )
                    if created:
                        self.stdout.write(self.style.SUCCESS(f"  Created UnitDefinition: {obj.unit_definition_name}"))
                    else:
                        self.stdout.write(self.style.WARNING(f"  Updated UnitDefinition: {obj.unit_definition_name}"))
                except UnitType.DoesNotExist:
                    self.stdout.write(self.style.ERROR(f"  Skipping UnitDefinition {row.get('UnitDefinitionName', 'N/A')}: UnitType with ID {row.get('UnitTypeId', 'N/A')} not found."))
                except Exception as inner_e:
                    self.stdout.write(self.style.ERROR(f"  Error processing row for UnitDefinition '{row.get('UnitDefinitionName', 'N/A')}': {inner_e}"))
        except FileNotFoundError:
            raise CommandError(f"UnitDefinition XLSX file not found at: {unit_definition_file}")
        except Exception as e:
            raise CommandError(f"Error importing UnitDefinition data: {e}")

        # --- Import UnitCategory Data ---
        # This depends on UnitType
        self.stdout.write(self.style.SUCCESS("Importing UnitCategory data..."))
        unit_category_file = os.path.join(xlsx_path, 'UnitCategory.xlsx')
        try:
            df_unit_category = pd.read_excel(unit_category_file)
            for index, row in df_unit_category.iterrows():
                try:
                    unit_type = UnitType.objects.get(unit_type_id=row['UnitTypeId'])

                    created_by = int(row['CreatedBy']) if pd.notna(row.get('CreatedBy')) and str(row['CreatedBy']) != '-1' else None
                    modified_by = int(row['ModifiedBy']) if pd.notna(row.get('ModifiedBy')) and str(row['ModifiedBy']) != '-1' else None

                    created_date = parse_date_robustly(row['CreatedDate'], 'created_date')
                    modified_date = parse_date_robustly(row['ModifiedDate'], 'modified_date')

                    obj, created = UnitCategory.objects.update_or_create(
                        unit_category_id=row['UnitCategoryId'],
                        defaults={
                            'unit_type': unit_type,
                            'unit_category_name': row['UnitCategoryName'],
                            'created_date': created_date,
                            'modified_date': modified_date,
                            'created_by': created_by,
                            'modified_by': modified_by,
                        }
                    )
                    if created:
                        self.stdout.write(self.style.SUCCESS(f"  Created UnitCategory: {obj.unit_category_name}"))
                    else:
                        self.stdout.write(self.style.WARNING(f"  Updated UnitCategory: {obj.unit_category_name}"))
                except UnitType.DoesNotExist:
                    self.stdout.write(self.style.ERROR(f"  Skipping UnitCategory {row.get('UnitCategoryName', 'N/A')}: UnitType with ID {row.get('UnitTypeId', 'N/A')} not found."))
                except Exception as inner_e:
                    self.stdout.write(self.style.ERROR(f"  Error processing row for UnitCategory '{row.get('UnitCategoryName', 'N/A')}': {inner_e}"))
        except FileNotFoundError:
            raise CommandError(f"UnitCategory XLSX file not found at: {unit_category_file}")
        except Exception as e:
            raise CommandError(f"Error importing UnitCategory data: {e}")

        # --- Import UnitSystemCategoryDefinition Data ---
        # This depends on UnitSystem, UnitCategory, and UnitDefinition
        self.stdout.write(self.style.SUCCESS("Importing UnitSystemCategoryDefinition data..."))
        unit_system_category_definition_file = os.path.join(xlsx_path, 'UnitSystemCategoryDefinition.xlsx')
        try:
            df_unit_system_category_definition = pd.read_excel(unit_system_category_definition_file)
            for index, row in df_unit_system_category_definition.iterrows():
                try:
                    unit_system = UnitSystem.objects.get(unit_system_id=row['UnitSystemId'])
                    unit_category = UnitCategory.objects.get(unit_category_id=row['UnitCategoryId'])
                    unit_definition = UnitDefinition.objects.get(unit_definition_id=row['UnitDefinitionId'])

                    created_by = int(row['CreatedBy']) if pd.notna(row.get('CreatedBy')) and str(row['CreatedBy']) != '-1' else None
                    modified_by = int(row['ModifiedBy']) if pd.notna(row.get('ModifiedBy')) and str(row['ModifiedBy']) != '-1' else None

                    created_date = parse_date_robustly(row['CreatedDate'], 'created_date')
                    modified_date = parse_date_robustly(row['ModifiedDate'], 'modified_date')

                    obj, created = UnitSystemCategoryDefinition.objects.update_or_create(
                        unit_system_category_definition_id=row['UnitSystemCategoryDefinitionId'],
                        defaults={
                            'unit_system': unit_system,
                            'unit_category': unit_category,
                            'unit_definition': unit_definition,
                            'created_date': created_date,
                            'modified_date': modified_date,
                            'created_by': created_by,
                            'modified_by': modified_by,
                        }
                    )
                    if created:
                        self.stdout.write(self.style.SUCCESS(f"  Created UnitSystemCategoryDefinition for: {unit_system.unit_system_name} - {unit_category.unit_category_name}"))
                    else:
                        self.stdout.write(self.style.WARNING(f"  Updated UnitSystemCategoryDefinition for: {unit_system.unit_system_name} - {unit_category.unit_category_name}"))
                except (UnitSystem.DoesNotExist, UnitCategory.DoesNotExist, UnitDefinition.DoesNotExist) as e:
                    self.stdout.write(self.style.ERROR(f"  Skipping UnitSystemCategoryDefinition for row {row.get('UnitSystemCategoryDefinitionId', 'N/A')}: Missing related object - {e}"))
                except Exception as inner_e:
                    self.stdout.write(self.style.ERROR(f"  Error processing row for UnitSystemCategoryDefinition '{row.get('UnitSystemCategoryDefinitionId', 'N/A')}': {inner_e}"))
        except FileNotFoundError:
            raise CommandError(f"UnitSystemCategoryDefinition XLSX file not found at: {unit_system_category_definition_file}")
        except Exception as e:
            raise CommandError(f"Error importing UnitSystemCategoryDefinition data: {e}")


        self.stdout.write(self.style.SUCCESS("All unit system data imported successfully! 🎉"))
