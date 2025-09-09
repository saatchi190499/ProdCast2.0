# Docker Compose implementaion for [Saatchi's project](https://github.com/saatchi190499/ProdCast2.0.git)
* Backend: Django + Gunicorn
* Frontend: React 
* Database: PostgreSQL

## Installation & Setup
### 1.Clone the repository
   ```
   git clone <your-repo-url>
   cd <project-folder>
   ```

### 2.Configure environment
  Edit the following files before running:
   <strike>
   ```
   backend/settings.py
   ```

  * ALLOWED_HOSTS → include your domain or server IP
  * CORS_ALLOWED_ORIGINS → add your frontend domain
</strike>
     
   ```
   docker-compose.yml
   ``` 
    
  * Ensure database credentials in environment section match Django settings.
  * set CORS_ALLOWED_ORIGINS
  * set DJANGO_SUPERUSER_USERNAME and DJANGO_SUPERUSER_PASSWORD
    
      
     
    
  > [!NOTE]
>  I am currently working on making those steps easier through env variables
### 3.Build & start containers
   ```
   docker compose up -d --build
   ```
This will start:
  * PostgreSQL on port 5432
  * Backend on port 8000 
  * Frontend on port 80
    
<strike>### 4.Run migrations & create superuser

Open a shell into the backend container: 
   ```
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
```
</strike>
 
 > [!NOTE]
><strike>This part will get automated to</strike>
 
> [!NOTE]
> Done


### 5. Access the app
 * Frontend: http://localhost/
 * Backend: http://localhost:8000/admin/

  > [!TIP]
>  To change API base URL used by frontend, update `frontend/src/links.jsx`

