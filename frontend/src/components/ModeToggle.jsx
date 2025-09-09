// components/ModeToggle.jsx
import { forwardRef } from "react";
import { Button } from "react-bootstrap";
import { FiMoon, FiSun } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";

const ModeToggle = forwardRef(function ModeToggle(
  { showIcon = true, className = "", ...props },
  ref
) {
  const { mode, toggleMode } = useTheme(); // "light" | "dark"
  const { t } = useTranslation();
  const isLight = mode === "light";
  const title = isLight ? (t("darkTheme") || "Тёмная тема")
                        : (t("lightTheme") || "Светлая тема");

  return (
    <Button
      ref={ref}
      variant="link"
      size="sm"
      onClick={toggleMode}
      title={title}
      aria-label={title}
      className={`p-0 m-0 border-1 text-body ${className}`}
      style={{ boxShadow: "none" }}
      {...props}
    >
      {showIcon ? (isLight ? <FiSun size={18} />: <FiMoon size={18} />)
                : <span className="visually-hidden">{title}</span>}
    </Button>
  );
});

export default ModeToggle;