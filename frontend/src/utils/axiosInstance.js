import axios from "axios";
import { getAccessToken, getRefreshToken, saveTokens, logout } from "./auth";
import API from "../links.jsx";

// --- Django API client (with JWT) ---
const api = axios.create({
  baseURL: API,
});

// 🔹 Attach access token to every request
api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// 🔹 Refresh token logic
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      getRefreshToken()
    ) {
      originalRequest._retry = true;

      try {
        const res = await axios.post(`${API}/token/refresh/`, {
          refresh: getRefreshToken(),
        });
        saveTokens({
          access: res.data.access,
          refresh: getRefreshToken(),
        });

        originalRequest.headers.Authorization = `Bearer ${res.data.access}`;
        return api(originalRequest);
      } catch (refreshError) {
        logout();
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

// --- Local Agent client (no JWT needed) ---
export const localApi = axios.create({
  baseURL: "http://127.0.0.1:9000",
  timeout: 0,
});

// На всякий случай - обнуляем таймаут в перехватчике, если где-то его перезапишут
localApi.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const refresh = getRefreshToken();
  if (refresh) {
    config.headers["X-Refresh-Token"] = refresh;
  }
  config.timeout = 0;
  return config;
});

export default api;
