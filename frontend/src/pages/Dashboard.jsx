import { Card, Row, Col } from "react-bootstrap";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";

export default function Dashboard() {
  const { user, role } = useAuth();
  const { t } = useTranslation();

  return (
    <>
      <h2>{t("welcome", { name: user?.first_name || user?.username })}</h2>

      <Row className="mt-4" xs={1} md={2} lg={3}>
        <Col>
          <Card bg="body" text="body" className="shadow-sm mb-3">
            <Card.Body>
              <Card.Title>🔐 {t("role")}</Card.Title>
              <Card.Text>{role}</Card.Text>
            </Card.Body>
          </Card>
        </Col>

        <Col>
          <Card bg="body" text="body" className="shadow-sm mb-3">
            <Card.Body>
              <Card.Title>📬 Email</Card.Title>
              <Card.Text>{user?.email || "—"}</Card.Text>
            </Card.Body>
          </Card>
        </Col>

        <Col>
          <Card bg="body" text="body" className="shadow-sm mb-3">
            <Card.Body>
              <Card.Title>⚙️ {t("settings")}</Card.Title>
              <Card.Text>{t("change_theme_lang")}</Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}
