import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import AdminPanel from "./settings/AdminPanel";
import LanguageSwitcher from "../components/LanguageSwitcher";
import ThemeSwitcher from "../components/ThemeSelect";
import { useTranslation } from "react-i18next";
import { Tabs, Tab, Container, Row, Col } from "react-bootstrap";

export default function Settings() {
  const { role } = useAuth();
  const { t } = useTranslation();
  const [key, setKey] = useState("profile");

  return (
    <Container fluid className="mt-4">
      <h2>{t("settings")}</h2>

      <Tabs activeKey={key} onSelect={(k) => setKey(k)} className="mb-3">
        <Tab eventKey="profile" title={t("profile")}>
          <Row>
            <Col md={6}>
              <p>{t("language")}: <LanguageSwitcher /></p>
              <p>{t("theme")}: <ThemeSwitcher /></p>
            </Col>
          </Row>
        </Tab>

        {role === "admin" && (
          <Tab eventKey="admin" title={t("admin_panel")}>
            <AdminPanel />
          </Tab>
        )}
      </Tabs>
    </Container>
  );
}
