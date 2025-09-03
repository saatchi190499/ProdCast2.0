import os
from celery import Celery
from django.conf import settings

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mainapp.settings")

app = Celery("mainapp")

# Используем настройки Django + Redis как брокер
app.config_from_object("django.conf:settings", namespace="CELERY")

# Автоматически ищем задачи в приложениях Django
app.autodiscover_tasks(lambda: settings.INSTALLED_APPS)
