# Use Python image
FROM python:3.11-slim

# Set workdir
WORKDIR /app/mainapp

# Prevent Python from writing pyc files + enable unbuffered logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install dependencies (system + Python)
RUN apt-get update \
    && apt-get install -y --no-install-recommends libldap2-dev libsasl2-dev gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install pip deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . /app
# Collect static files
RUN python manage.py collectstatic --noinput

# Copy entrypoint
COPY entrypoint.sh /app/
# Run migrations + collectstatic on container start
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn", "mainapp.wsgi:application", "--bind", "0.0.0.0:8000"]
