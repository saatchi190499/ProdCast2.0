# Docker Compose implementation for ProdCast 2.0
- Backend: Django (+ Gunicorn in image)
- Frontend: React (Vite)
- Database: PostgreSQL
- Cache/Broker: Redis

## Documentation
- Model Data Architecture: see `docs/model-data-architecture.md` for entities, relationships, storage tables, constraints, and an ER diagram.

## Installation & Setup
### 1. Clone the repository
```
git clone <your-repo-url>
cd <project-folder>
```

### 2. Configure environment
Edit these env files (used by `docker-compose.yml`):
- `backend/mainapp/.env.development` (Django + Postgres + Redis)
- `frontend/.env.development` (Vite)

If you want to expose the app on a LAN IP, set `DJANGO_ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS`.

### Windows-only integrations
- The Petex (OpenServer/COM) integration requires Windows + `pywin32` and will not run inside Linux containers. The backend still starts, but Petex endpoints will error if called.

### 3. Build & start containers
```
docker compose up -d --build
```

This will start:
- PostgreSQL on port 5432
- Backend on port 8000
- Frontend on port 80

### 4. Access the app
- Frontend: http://localhost/
- Backend: http://localhost:8000/admin/

Tip: API base URL is defined in `frontend/src/links.jsx`.
