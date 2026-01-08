import os
from datetime import timedelta
from pathlib import Path

import environ
import socket

BASE_DIR = Path(__file__).resolve().parent.parent
env = environ.Env(
    DJANGO_DEBUG=(bool, True)  # default True if not set
)
environ.Env.read_env(BASE_DIR / ".env.development", overwrite=False)
# --- Security / Debug ---
SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-secret-key")
DEBUG = env("DJANGO_DEBUG", default=True)


def _detect_host_ip() -> str:
    """Return the primary outbound IP of the host, fallback to localhost."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


HOST_IP = env("DJANGO_HOST_IP", default=_detect_host_ip())
_raw_allowed = env("DJANGO_ALLOWED_HOSTS", default=HOST_IP)
ALLOWED_HOSTS = [h.strip() for h in _raw_allowed.split(",") if h.strip()]
if DEBUG and not _raw_allowed.strip():
    ALLOWED_HOSTS = ["*"]

# --- CORS ---
_raw_cors = env("CORS_ALLOWED_ORIGINS", default=f"http://{HOST_IP}").strip()
CORS_ALLOWED_ORIGINS = [o.strip() for o in _raw_cors.split(",") if o.strip()]
if DEBUG and not _raw_cors:
    CORS_ALLOW_ALL_ORIGINS = True

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "django_celery_results",
    "apiapp",
    "smart_selects",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "mainapp.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "mainapp.wsgi.application"

# --- Database ---
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", default="prodcast2"),
        "USER": env("POSTGRES_USER", default="postgres"),
        "PASSWORD": env("POSTGRES_PASSWORD", default="1"),
        "HOST": env("POSTGRES_HOST", default="db"),
        "PORT": env("POSTGRES_PORT", default="5432"),
    }
}

# DATABASES = {
#     'default': {
#         'ENGINE': 'mssql',
#         'NAME': 'DOFGI1',
#         'HOST': 'KPCDBS14\\CYRGEN',
#         'OPTIONS': {
#             'driver': 'ODBC Driver 17 for SQL Server',
#             'trusted_connection': 'yes',
#         },
#     },
# }





# --- Auth & JWT ---
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Если нужен LDAP — оставьте и заполните переменные окружения.
AUTHENTICATION_BACKENDS = [
    "apiapp.backend.LDAPBackend",
    "django.contrib.auth.backends.ModelBackend",
]
AUTH_LDAP_SERVER_URI = os.getenv("AUTH_LDAP_SERVER_URI", "ldap://kpcldc04.kio.kz")
AUTH_LDAP_BIND_DN = os.getenv("AUTH_LDAP_BIND_DN", "")
AUTH_LDAP_BIND_PASSWORD = os.getenv("AUTH_LDAP_BIND_PASSWORD", "")
AUTH_LDAP_USER_DN_TEMPLATE = os.getenv("AUTH_LDAP_USER_DN_TEMPLATE", "%(user)s@kio.kz")
AUTH_LDAP_CREATE_USERS = True
AUTH_LDAP_ALWAYS_UPDATE_USER = False

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=5),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ROTATE_REFRESH_TOKENS": False,
    "BLACKLIST_AFTER_ROTATION": True,
}

# --- i18n / timezone ---
LANGUAGE_CODE = "en-us"
TIME_ZONE = env("DJANGO_TIME_ZONE", default="Asia/Almaty")
USE_I18N = True
USE_TZ = True

# --- Static / Media ---
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# --- Celery / Redis ---
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://redis:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://redis:6379/1")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_DEFAULT_QUEUE = "default"
CELERY_TASK_ROUTES = {
    "worker.run_scenario": {"queue": "scenarios"},
    "worker.run_workflow": {"queue": "workflows"},
    "mainserver.run_workflow_schedules": {"queue": "default"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Логи — с ротацией и на D:
DJANGO_LOG_DIR = Path(env("DJANGO_LOG_DIR", default=str(BASE_DIR / "logs")))
DJANGO_LOG_DIR.mkdir(parents=True, exist_ok=True)
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "rotating_file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": str(DJANGO_LOG_DIR / "django.log"),
            "maxBytes": 5 * 1024 * 1024,
            "backupCount": 5,
            "encoding": "utf-8",
        },
        "console": {"class": "logging.StreamHandler"},
    },
    "root": {"handlers": ["rotating_file", "console"], "level": "INFO"},
}
