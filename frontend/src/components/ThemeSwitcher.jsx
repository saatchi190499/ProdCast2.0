import { useTheme } from "../context/ThemeContext";
import { useTranslation } from "react-i18next";
import { Button } from "react-bootstrap";
import { FiMoon, FiSun} from "react-icons/fi"

export default function ThemeSwitcher() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <Button
      variant="link"
      size="sm"
      onClick={toggleTheme}
      title={theme === "light" ? "Тёмная тема" : "Светлая тема"}
      className="p-0 m-0 text-dark border-0"
      style={{ boxShadow: "none" }}
    >
      {theme === "light" ?  <FiMoon size={18} /> : <FiSun size={18} color="white" />}
    </Button>
  );
}
