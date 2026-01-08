#!/bin/sh

set -e

echo "Waiting for Postgres..."
python - <<'PY'
import os
import socket
import time

host = os.getenv("POSTGRES_HOST", "db")
port = int(os.getenv("POSTGRES_PORT", "5432"))
deadline = time.time() + int(os.getenv("POSTGRES_WAIT_SECONDS", "60"))

while True:
    try:
        with socket.create_connection((host, port), timeout=2):
            break
    except OSError:
        if time.time() > deadline:
            raise SystemExit(f"Postgres not reachable at {host}:{port}")
        time.sleep(1)
PY

echo "Make migrations..."
python manage.py makemigrations --noinput
echo "Running migrations..."
python manage.py migrate --noinput

# Create superuser if it doesn't exist
if [ "$DJANGO_SUPERUSER_USERNAME" ] && [ "$DJANGO_SUPERUSER_PASSWORD" ] && [ "$DJANGO_SUPERUSER_EMAIL" ]; then
    echo "Creating superuser..."
    python manage.py createsuperuser \
        --noinput \
        --username "$DJANGO_SUPERUSER_USERNAME" \
        --email "$DJANGO_SUPERUSER_EMAIL" || true
    echo "Uploading units data..."
    python manage.py load_units
    echo "Uploading init data..."
    python manage.py init_data

fi

echo "Starting Gunicorn..."
exec "$@"
