import os
from django.http import HttpResponse, HttpResponseNotFound
from django.views.decorators.csrf import csrf_exempt

BASE_DIR = os.path.dirname(__file__)
MODULE_PATHS = {
    "petex_client": os.path.join(BASE_DIR, "petex_client"),
    "pi_client": os.path.join(BASE_DIR, "pi_client"),
    "apiapp": os.path.abspath(os.path.join(BASE_DIR, "..", "..")),
}

@csrf_exempt
def get_module(request, path):
    parts = path.split("/", 1)
    if not parts or parts[0] not in MODULE_PATHS:
        return HttpResponseNotFound("Unknown package")

    package_root = MODULE_PATHS[parts[0]]
    relative_path = parts[1] if len(parts) > 1 else "__init__.py"
    file_path = os.path.join(package_root, relative_path)

    if os.path.isdir(file_path):
        file_path = os.path.join(file_path, "__init__.py")

    if not file_path.endswith(".py") and not os.path.isdir(file_path):
        file_path += ".py"

    if not os.path.exists(file_path):
        return HttpResponseNotFound(f"Module not found: {path}")

    with open(file_path, "r", encoding="utf-8") as f:
        code = f.read()

    return HttpResponse(code, content_type="text/plain")



__all__ = [
    "get_module",
]
