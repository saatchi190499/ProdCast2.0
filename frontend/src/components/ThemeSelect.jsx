// components/ThemeSelect.jsx
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";

export default function ThemeSelect({ className = "", style, ...props }) {
  const { colorTheme, setColorTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <select
      value={colorTheme}
      onChange={(e) => setColorTheme(e.target.value)}
      className={`ds-input form-select ${className}`}
      style={{ maxWidth: 180, ...style }}
      aria-label={t("colorTheme") || "Color theme"}
      {...props}
    >
      <option value="default">{t("theme_default") || "Default (Blue)"}</option>
      <option value="sunset">{t("theme_sunset") || "Sunset"}</option>
      <option value="forest">{t("theme_forest") || "Forest"}</option>
      <option value="violet">{t("theme_violet") || "Violet"}</option>
    </select>
  );
}