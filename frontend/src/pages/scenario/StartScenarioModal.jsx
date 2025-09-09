import { useState } from "react";
import { Modal, Button, Form, Spinner } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import api from "../../utils/axiosInstance";

export default function StartScenarioModal({ show, onHide, scenarios, currentUser, onStarted }) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  // Only allow user's own scenarios
  const userScenarios = (scenarios || []).filter(s => s.created_by === currentUser);
  const filteredScenarios = userScenarios.filter(s =>
    (s.scenario_name || "").toLowerCase().includes(searchText.toLowerCase())
  );

  const handleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
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
      onStarted && onStarted();
      onHide();
      setSelectedIds([]);
      setStartDate("");
      setEndDate("");
      setSearchText("");
    } catch (err) {
      console.error("Ошибка при старте сценария:", err.response?.status, err.response?.data || err.message);
      alert(t("startError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title className="ds-title">{t("startScenario")}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <Form>
          <Form.Group className="mb-3">
            <Form.Label className="ds-title d-flex justify-content-between align-items-center">
              <span>{t("selectScenario")}</span>
              <small className="text-muted">
                {selectedIds.length > 0 ? `${selectedIds.length} ${t("selected")}` : t("nothingSelected") || ""}
              </small>
            </Form.Label>

            <Form.Control
              type="text"
              placeholder={t("search")}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="ds-input"
              style={{ marginBottom: 8, maxWidth: 420 }}
            />

            {/* Rounded, brand-bordered list wrapper */}
            <div
              className="brand-scroll"
              style={{
                maxHeight: 220,
                overflowY: "auto",
                border: "1px solid var(--brand-outline)",
                borderRadius: 12,
                padding: 10
              }}
            >
              {filteredScenarios.length === 0 ? (
                <div className="text-muted">{t("noOwnScenarios")}</div>
              ) : (
                filteredScenarios.map(s => (
                  <Form.Check
                    key={s.scenario_id}
                    type="checkbox"
                    id={`start-scn-${s.scenario_id}`}
                    label={s.scenario_name}
                    checked={selectedIds.includes(s.scenario_id)}
                    onChange={() => handleSelect(s.scenario_id)}
                    className="mb-2"
                  />
                ))
              )}
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="ds-title">{t("start_date_on_schedule")}</Form.Label>
            <Form.Control
              type="datetime-local"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="ds-input"
              style={{ maxWidth: 260 }}
            />
          </Form.Group>

          <Form.Group className="mb-0">
            <Form.Label className="ds-title">{t("end_date_on_schedule")}</Form.Label>
            <Form.Control
              type="datetime-local"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="ds-input"
              style={{ maxWidth: 260 }}
            />
          </Form.Group>
        </Form>
      </Modal.Body>

      <Modal.Footer>
        <button className="btn btn-ghost" onClick={onHide} disabled={loading}>
          {t("cancel")}
        </button>
        <button
          className="btn btn-brand"
          onClick={handleStart}
          disabled={loading || !startDate || !endDate || selectedIds.length === 0}
        >
          {loading ? <Spinner size="sm" className="me-1" /> : null}
          {t("start")}
        </button>
      </Modal.Footer>
    </Modal>
  );
}