import { createContext, useContext, useEffect, useState } from "react";
import { getAccessToken, getRefreshToken, logout as clearTokens } from "../utils/auth";
import api from "../utils/axiosInstance";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [role, setRole] = useState("guest");
  
    const fetchUser = async () => {
      try {
        const res = await api.get("/me/");
        setUser(res.data);
        setRole(res.data.role || "user");
      } catch {
        setUser(null);
        setRole("guest");
      }
    };
  
    const refreshUser = fetchUser; // экспортируем как публичный метод
  
    const logout = () => {
      clearTokens();
      setUser(null);
      setRole("guest");
      window.location.href = "/login";
    };
  
    const isAuthenticated = !!getAccessToken();
  
    useEffect(() => {
      if (isAuthenticated) fetchUser();
    }, []);
  
    return (
      <AuthContext.Provider value={{ user, role, isAuthenticated, logout, refreshUser }}>
        {children}
      </AuthContext.Provider>
    );
  }
  

export function useAuth() {
  return useContext(AuthContext);
}
