import axios from "axios";
import { getAccessToken, getRefreshToken, saveTokens, logout } from "./auth";
import API from "../links.jsx"
const api = axios.create({
  baseURL: API,
});

// Добавляем access токен в каждый запрос
api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Обрабатываем 401 и пытаемся обновить access токен
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

        // Повторяем оригинальный запрос с новым access токеном
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

export default api;
