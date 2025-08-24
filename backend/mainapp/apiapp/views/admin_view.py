from django.contrib.auth.models import User, Group
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes

class UserListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.groups.filter(name="admin").exists():
            return Response(status=403)

        users = User.objects.all().values("id", "username", "email", "first_name", "last_name")
        result = []
        for u in users:
            user_obj = User.objects.get(id=u["id"])
            groups = list(user_obj.groups.values_list("name", flat=True))
            u["role"] = groups[0] if groups else "guest"
            result.append(u)
        return Response(result)

    def post(self, request):
        if not request.user.groups.filter(name="admin").exists():
            return Response(status=403)

        username = request.data.get("username")
        password = request.data.get("password")
        role = request.data.get("role", "guest")

        if not username or not password:
            return Response({"error": "username and password required"}, status=400)

        user = User.objects.create_user(username=username, password=password)
        group = Group.objects.get(name=role)
        user.groups.add(group)
        return Response({"id": user.id, "username": user.username}, status=201)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def change_user_role(request, user_id):
    if not request.user.groups.filter(name="admin").exists():
        return Response(status=403)

    new_role = request.data.get("role")
    if new_role not in ["admin", "user", "guest"]:
        return Response({"error": "Invalid role"}, status=400)

    try:
        user = User.objects.get(id=user_id)
        user.groups.clear()
        user.groups.add(Group.objects.get(name=new_role))
        return Response({"status": "role updated"})
    except User.DoesNotExist:
        return Response({"error": "User not found"}, status=404)
