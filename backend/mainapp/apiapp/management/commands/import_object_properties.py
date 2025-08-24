# your_project_name/apiapp/management/commands/import_object_properties.pyimport_object_properties.py

import os
import pandas as pd # Import pandas for reading XLSX files
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from apiapp.models import ObjectType, ObjectTypeProperty
from django.conf import settings # Import settings to get BASE_DIR

class Command(BaseCommand):
    help = 'Imports ObjectTypeProperty data from an XLSX file using pandas.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            help='The path to the XLSX file containing ObjectTypeProperty data.',
            # Default to a file named 'object_properties.xlsx' in the app's data folder
            default=os.path.join(settings.BASE_DIR, 'apiapp', 'management', 'commands', 'data', 'OpenServers.xlsx'),
        )

    def handle(self, *args, **options):
        xlsx_filepath = options['file'] # Renamed variable for clarity
        self.stdout.write(self.style.SUCCESS(f"Starting import of ObjectTypeProperty data from: {xlsx_filepath}"))

        # Define a default ObjectType to associate these properties with.
        default_object_type_name = "WELL"
        default_category = "IPR_Input"  # Default category for ObjectTypeProperty

        try:
            with transaction.atomic(): # Use transaction to ensure atomicity
                # Get or create the default ObjectType
                object_type, created = ObjectType.objects.get_or_create(
                    object_type_name=default_object_type_name
                )
                if created:
                    self.stdout.write(self.style.SUCCESS(f"  Created ObjectType: '{default_object_type_name}'"))
                else:
                    self.stdout.write(self.style.WARNING(f"  Using existing ObjectType: '{default_object_type_name}'"))

                # Read data from the XLSX file using pandas
                try:
                    df = pd.read_excel(xlsx_filepath)
                except FileNotFoundError:
                    raise CommandError(f"XLSX file not found at: {xlsx_filepath}. Please ensure the file exists.")
                except Exception as e:
                    raise CommandError(f"Error reading XLSX file '{xlsx_filepath}': {e}")

                # Assuming the first column (index 0) is 'OpenServer Commands' (tag)
                # and the second column (index 1) is 'Discription' (property name)
                # You can adjust these column names/indices if your Excel file is different.
                tag_column_name = df.columns[0]
                prop_name_column_name = df.columns[1]

                self.stdout.write(self.style.NOTICE(f"  Assuming Tag is in column '{tag_column_name}' and Property Name in column '{prop_name_column_name}'"))


                for index, row_data in df.iterrows():
                    try:
                        tag = str(row_data.get(tag_column_name, '')).strip()
                        prop_name = str(row_data.get(prop_name_column_name, '')).strip()

                        if not tag or not prop_name:
                            self.stdout.write(self.style.WARNING(f"  Skipping row {index + 2} (Excel row number): '{row_data.to_dict()}' (empty tag or property name)"))
                            continue

                        obj_prop, created = ObjectTypeProperty.objects.update_or_create(
                            object_type=object_type,
                            object_type_property_name=prop_name,
                            defaults={
                                'object_type_property_category': default_category,
                                'tag': None,
                                'openserver': tag, # No specific value from provided Excel data
                                'unit': None,        # No specific value from provided Excel data
                                'unit_system': None, # No specific value from provided Excel data
                            }
                        )
                        if created:
                            self.stdout.write(self.style.SUCCESS(f"  Created ObjectTypeProperty: {obj_prop}"))
                        else:
                            self.stdout.write(self.style.WARNING(f"  Updated ObjectTypeProperty: {obj_prop}"))

                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f"  Error processing row {index + 2} ('{row_data.to_dict()}'): {e}"))

        except Exception as e:
            raise CommandError(f"An error occurred during ObjectTypeProperty import: {e}")

        self.stdout.write(self.style.SUCCESS("ObjectTypeProperty data import completed! ✨"))

