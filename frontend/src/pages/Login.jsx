import { useState } from "react";
import { login } from "../api/auth";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { Form, Button, Container, Card } from "react-bootstrap";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { t } = useTranslation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(username, password);
      await refreshUser();
      navigate("/");
    } catch {
      alert("Неверный логин или пароль");
    }
  };

  return (
    <Container className="d-flex justify-content-center align-items-center" style={{ height: "90vh" }}>
      <Card style={{ width: "24rem" }} className="p-4 shadow">
        <h3 className="text-center mb-4">{t("login")}</h3>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label>{t("username")}</Form.Label>
            <Form.Control
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Логин"
              required
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>{t("password")}</Form.Label>
            <Form.Control
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль"
              required
            />
          </Form.Group>

          <Button variant="primary" type="submit" className="w-100">
            {t("login")}
          </Button>
        </Form>
      </Card>
    </Container>
  );
}
