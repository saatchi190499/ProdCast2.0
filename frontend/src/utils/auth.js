export function saveTokens({ access, refresh }) {
    localStorage.setItem("access", access);
    localStorage.setItem("refresh", refresh);
  }
  
  export function getAccessToken() {
    return localStorage.getItem("access");
  }
  
  export function getRefreshToken() {
    return localStorage.getItem("refresh");
  }
  
  export function logout() {
    localStorage.clear();
  }
  
  export function isAuthenticated() {
    return !!getAccessToken();
  }
  