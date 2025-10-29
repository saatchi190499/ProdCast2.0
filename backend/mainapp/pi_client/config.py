from requests_kerberos import HTTPKerberosAuth, OPTIONAL
import urllib3

# Allow self-signed SSL certs for internal PI Web API
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://kpcpdw08/piwebapi"


def get_auth():
    """Return Kerberos auth used for PI Web API calls."""
    return HTTPKerberosAuth(mutual_authentication=OPTIONAL)

