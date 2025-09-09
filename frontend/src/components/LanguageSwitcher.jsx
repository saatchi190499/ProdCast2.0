import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { Button } from "react-bootstrap";
import { FaGlobe } from "react-icons/fa";

const LanguageSwitcher = forwardRef(function LanguageSwitcher(
  { showIcon = true, className = "", ...props },
  ref
) {
  const { i18n } = useTranslation();
  const isRu = i18n.language === "ru";
  const title = isRu ? "Switch to English" : "Сменить на Русский";

  const handleClick = () => i18n.changeLanguage(isRu ? "en" : "ru");

  return (
    <Button
      ref={ref}
      variant="link"
      size="sm"
      onClick={handleClick}
      title={title}
      aria-label={title}
      className={`p-0 m-0 border-0 ${className}`}
      style={{
        boxShadow: "none",
        color: "var(--sidebar-fg)", // 👈 tie to sidebar color
      }}
      {...props}
    >
      {showIcon ? (
        <FaGlobe size={18} />
      ) : (
        <span className="visually-hidden">{title}</span>
      )}
    </Button>
  );
});

export default LanguageSwitcher;