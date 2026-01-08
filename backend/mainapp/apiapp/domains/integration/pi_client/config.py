import urllib3

# Allow self-signed SSL certs for internal PI Web API
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://kpcpdw08/piwebapi"


try:
    from requests_kerberos import HTTPKerberosAuth, OPTIONAL  # type: ignore[import-not-found]
except Exception:
    HTTPKerberosAuth = None
    OPTIONAL = None


def get_auth():
    """Return Kerberos auth used for PI Web API calls."""
    if HTTPKerberosAuth is None:
        return None
    return HTTPKerberosAuth(mutual_authentication=OPTIONAL)
