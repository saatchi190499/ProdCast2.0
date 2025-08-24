import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { Button } from "react-bootstrap";
import { FaGlobe } from "react-icons/fa"

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const { theme } = useTheme(); 

  return (
    <Button
      variant="link"
      size="sm"
      onClick={() => i18n.changeLanguage(i18n.language === "ru" ? "en" : "ru")}
      title={i18n.language === "ru" ? "Switch to English" : "Сменить на Русский"}
      className="p-0 m-0 border-0"
      style={{ boxShadow: "none" }}
    >
      <FaGlobe size={18} color={theme === "light" ? "black" : "white"} />
    </Button>
  );
}
