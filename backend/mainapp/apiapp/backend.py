from django.contrib.auth.backends import BaseBackend
from django.contrib.auth.models import User
from ldap3 import Server, Connection, ALL, SIMPLE

LDAP_SERVER = "ldap://kpcldc04.kio.kz"
LDAP_USER_DN_TEMPLATE = "{}@kio.kz"

class LDAPBackend(BaseBackend):
    def authenticate(self, request, username=None, password=None):
        user_dn = LDAP_USER_DN_TEMPLATE.format(username)
        server = Server(LDAP_SERVER, get_info=ALL)
        try:
            conn = Connection(server, user=user_dn, password=password, authentication=SIMPLE, auto_bind=True)
            # успешная аутентификация
            user, created = User.objects.get_or_create(username=username)
            if created:
                user.set_unusable_password()
                user.save()
            return user
        except Exception:
            return None

    def get_user(self, user_id):
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None