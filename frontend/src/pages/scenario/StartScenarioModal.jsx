import { useState } from "react";
import { Modal, Button, Form } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import api from "../../utils/axiosInstance";

export default function StartScenarioModal({ show, onHide, scenarios, currentUser, onStarted }) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchText, setSearchText] = useState(""); // mini search
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState(""); // end schedule date

  const [loading, setLoading] = useState(false);

  // Only allow user's own scenarios
  const userScenarios = (scenarios || []).filter(s => s.created_by === currentUser);
  const filteredScenarios = userScenarios.filter(s =>
    s.scenario_name.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      await Promise.all(
        selectedIds.map(sid =>
          api.post(`/scenarios/${sid}/start/`, {
            start_date: startDate,
            end_date: endDate,
          })
        )
      );
      setLoading(false);
      onStarted && onStarted();
      onHide();
      setSelectedIds([]);
      setStartDate("");
      setEndDate("");
      setSearchText("");
    } catch (err) {
      console.error("Ошибка при старте сценария:", err.response?.status, err.response?.data || err.message);
      alert(t("startError"));
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>{t("startScenario")}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group className="mb-3">
            <Form.Label>{t("selectScenario")}</Form.Label>
            <Form.Control
              type="text"
              placeholder={t("search")}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #eee", borderRadius: 4, padding: 8 }}>
              {filteredScenarios.length === 0 ? (
                <div className="text-muted">{t("noOwnScenarios")}</div>
              ) : (
                filteredScenarios.map(s => (
                  <Form.Check
                    key={s.scenario_id}
                    type="checkbox"
                    label={s.scenario_name}
                    checked={selectedIds.includes(s.scenario_id)}
                    onChange={() => handleSelect(s.scenario_id)}
                  />
                ))
              )}
            </div>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>{t("start_date_on_schedule")}</Form.Label>
            <Form.Control
              type="datetime-local"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>{t("end_date_on_schedule")}</Form.Label>
            <Form.Control
              type="datetime-local"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={handleStart}
          disabled={loading || !startDate || !endDate || selectedIds.length === 0}
        >
          {t("start")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}