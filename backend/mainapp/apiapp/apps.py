# apiapp/apps.py

from django.apps import AppConfig
from django.db.utils import OperationalError


class ApiappConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apiapp'
    verbose_name = "API Application"

    def ready(self):
        """
        Метод вызывается, когда Django загружает приложение.
        Используется для автоматического создания начальных DataSource.
        """
        # Импортируем модели здесь, чтобы избежать циклического импорта
        # так как ready() вызывается во время загрузки приложения.
        from .models import DataSource

        # Список источников данных, которые должны быть созданы автоматически
        required_data_sources = ['Models', 'Events', 'Results']

        try:
            # Проверяем, существует ли таблица DataSource
            # Это важно, чтобы избежать ошибок при первой миграции базы данных,
            # когда таблица еще не создана.
            if DataSource._meta.db_table in self.connection.introspection.table_names():
                for source_name in required_data_sources:
                    # Используем get_or_create, чтобы избежать дубликатов,
                    # если DataSource уже существует
                    data_source, created = DataSource.objects.get_or_create(
                        data_source_name=source_name
                    )
                    if created:
                        print(f"DataSource '{source_name}' успешно создан.")
                    else:
                        print(f"DataSource '{source_name}' уже существует.")
            else:
                print("Таблица apiapp_data_source еще не существует. Пропустили создание начальных DataSource.")
        except OperationalError:
            # Обрабатываем случай, когда база данных еще не готова или недоступна
            print("Ошибка подключения к базе данных. Пропустили создание начальных DataSource.")
        except Exception as e:
            print(f"Произошла неожиданная ошибка при создании DataSource: {e}")


