const envBackend = import.meta.env.VITE_BACKEND_URL;
const envHost = import.meta.env.VITE_HOST_IP;

let API = envBackend;

if (!API) {
  // Build from provided host or fall back to the current browser host.
  const hostname =
    envHost ||
    (typeof window !== "undefined" && window.location && window.location.hostname) ||
    "localhost";
  const protocol =
    typeof window !== "undefined" && window.location ? window.location.protocol : "http:";
  API = `${protocol}//${hostname}:8000/api`;
}

export default API;
