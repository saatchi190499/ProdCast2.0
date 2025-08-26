import axios from "axios";
import { saveTokens, getRefreshToken, logout } from "../utils/auth";
import API from "../links.jsx"

export async function login(username, password) {
  const res = await axios.post(`${API}/login/`, { username, password });
  saveTokens(res.data);
  return res.data;
}

export async function refreshToken() {
  const refresh = getRefreshToken();
  if (!refresh) throw new Error("No refresh token");

  const res = await axios.post(`${API}/token/refresh/`, { refresh });
  saveTokens({ access: res.data.access, refresh });
  return res.data.access;
}
