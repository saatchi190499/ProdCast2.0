#!/bin/sh

set -e

echo "Make migrations..."
python manage.py makemigrations --noinput
echo "Running migrations..."
python manage.py migrate --noinput

# Create superuser if it doesn’t exist
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
