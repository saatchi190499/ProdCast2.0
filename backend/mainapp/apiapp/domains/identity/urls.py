from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from apiapp.domains.identity.views import LDAPLoginView, MeView, UserListView, change_user_role


urlpatterns = [
    path("login/", LDAPLoginView.as_view()),
    path("me/", MeView.as_view(), name="me"),
    path("users/", UserListView.as_view()),
    path("users/<int:user_id>/role/", change_user_role),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]


__all__ = ["urlpatterns"]
