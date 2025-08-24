import { useEffect, useState } from "react";
import api from "../../utils/axiosInstance";
import { Card, Container, Row, Col } from "react-bootstrap";

export default function ModelsPage() {
  const [models, setModels] = useState([]);

  useEffect(() => {
    api.get("/api/components/") // или другой эндпоинт
      .then((res) => setModels(res.data))
      .catch((err) => console.error(err));
  }, []);

  // Условие разделения (например: по названию, создателю, признаку)
  const officialModels = models.filter((m) => m.name.startsWith("OFC_"));
  const registeredModels = models.filter((m) => m.name.startsWith("REG_"));

  return (
    <Container>
      <h2 className="mb-4">📘 Официальные модели</h2>
      <Row>
        {officialModels.map((model) => (
          <Col key={model.id} md={4} className="mb-3">
            <Card>
              <Card.Body>
                <Card.Title>{model.name}</Card.Title>
                <Card.Text>{model.description}</Card.Text>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      <h2 className="mt-5 mb-4">📝 Регистрационные модели</h2>
      <Row>
        {registeredModels.map((model) => (
          <Col key={model.id} md={4} className="mb-3">
            <Card>
              <Card.Body>
                <Card.Title>{model.name}</Card.Title>
                <Card.Text>{model.description}</Card.Text>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </Container>
  );
}
