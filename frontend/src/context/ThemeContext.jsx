import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  // light | dark
  const [mode, setMode] = useState("light");
  // default | sunset | forest | violet ...
  const [colorTheme, setColorTheme] = useState("default");

  useEffect(() => {
    // restore saved prefs
    const savedMode = localStorage.getItem("mode") || "light";
    const savedColor = localStorage.getItem("colorTheme") || "default";
    setMode(savedMode);
    setColorTheme(savedColor);

    // apply attributes
    document.documentElement.setAttribute("data-bs-theme", savedMode);
    document.documentElement.setAttribute("data-theme", savedColor);
  }, []);

  // toggle only light/dark
  const toggleMode = () => {
    const next = mode === "light" ? "dark" : "light";
    setMode(next);
    localStorage.setItem("mode", next);
    document.documentElement.setAttribute("data-bs-theme", next);
  };

  // change only color palette
  const changeColorTheme = (next) => {
    setColorTheme(next);
    localStorage.setItem("colorTheme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  return (
    <ThemeContext.Provider
      value={{
        mode,
        toggleMode,
        colorTheme,
        setColorTheme: changeColorTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}