import { useState, useEffect } from "react";
import { Card, Button, Form, Table, Modal, ToggleButton, ButtonGroup } from "react-bootstrap";
import api from "../../utils/axiosInstance";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import StartScenarioModal from "./StartScenarioModal";
import { FaRegClipboard } from "react-icons/fa";
import WorkerStatusPanel from "./WorkerStatusModal";

function ScenarioTable({ scenarios, sortKey, sortAsc, onSort, onShowLogs }) {
  const { t } = useTranslation();
  const columns = [
    { key: "scenario_name", label: t("componentName") },
    { key: "created_by", label: t("author") },
    { key: "created_date", label: t("created") },
    { key: "status", label: t("status") },
    { key: "start_date", label: t("start_date") },
    { key: "end_date", label: t("end_date") },
    { key: "server", label: t("server") },
    { key: "models", label: t("model") },
    { key: "events", label: t("event") },
    { key: "is_approved", label: t("approved") },
    { key: "description", label: t("description") }
  ];

  return (
    <Table bordered hover responsive size="sm" className="mb-4">
      <thead className="table-secondary">
        <tr>
          {columns.map(col => (
            <th
              key={col.key}
              style={{ cursor: "pointer" }}
              onClick={() => onSort(col.key)}
            >
              {col.label}
              {sortKey === col.key && (
                <span style={{ marginLeft: 4 }}>
                  {sortAsc ? "▲" : "▼"}
                </span>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {scenarios.map(s => (
          <tr key={s.scenario_id}>
            <td>{s.scenario_name}</td>
            <td>{s.created_by || "—"}</td>
            <td>{s.created_date ? new Date(s.created_date).toLocaleString() : "—"}</td>
            <td>
              {s.status}{" "}
              {s.progress !== undefined && s.progress !== null && (
                <span>({s.progress}%)</span>
              )}
              <Button
                variant="link"
                size="sm"
                onClick={() => onShowLogs(s)}
                title={t("viewLogs")}
              >
                <FaRegClipboard />
              </Button>
            </td>
            <td>{s.start_date ? new Date(s.start_date).toLocaleString() : "—"}</td>
            <td>{s.end_date ? new Date(s.end_date).toLocaleString() : "—"}</td>
            <td>{s.server || "—"}</td>
            <td>
              {(s.components || [])
                .filter(c => c.data_source_name === "Models")
                .map(c => c.name)
                .join(", ") || "—"}
            </td>
            <td>
              {(s.components || [])
                .filter(c => c.data_source_name === "Events")
                .map(c => c.name)
                .join(", ") || "—"}
            </td>
            <td>{s.is_approved ? "✔" : "—"}</td>
            <td>{s.description}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default function ScenariosPage() {
  const [scenarios, setScenarios] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const { role } = useAuth();
  // For scenario creation
  const [scenarioName, setScenarioName] = useState("");
  const [description, setDescription] = useState("");
  const [availableComponents, setAvailableComponents] = useState([]);
  const [selectedComponents, setSelectedComponents] = useState({});
  const [saving, setSaving] = useState(false);
  const [sortKey, setSortKey] = useState("scenario_name");
  const [sortAsc, setSortAsc] = useState(true);
  // Search and filter
  const [searchText, setSearchText] = useState("");
  const [showOnlyUser, setShowOnlyUser] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const { t } = useTranslation();

  const [showStartModal, setShowStartModal] = useState(false);

  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsScenarioName, setLogsScenarioName] = useState("");
  const [showWorkerPanel, setShowWorkerPanel] = useState(false);


  const fetchScenarios = async () => {
    const res = await api.get("/scenarios/all/");
    setScenarios(res.data);
  };

  useEffect(() => {
    const interval = setInterval(async () => {
      const updatedScenarios = await Promise.all(
        scenarios.map(async s => {
          if (s.celery_task_id && s.status !== "done") {
            try {
              const res = await api.get(`/scenarios/${s.scenario_id}/status/`);
              return { ...s, status: res.data.status, progress: res.data.progress };
            } catch {
              return s;
            }
          }
          return s;
        })
      );
      setScenarios(updatedScenarios);
    }, 3000); // каждые 3 сек проверяем
    return () => clearInterval(interval);
  }, [scenarios]);


  useEffect(() => {
    fetchScenarios();
    const interval = setInterval(fetchScenarios, 5000); // обновляем каждые 5 сек
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    api.get("/components/by-data-source/").then(res => setAvailableComponents(res.data));
    // Get current user info (assumes /users/me/ returns {username: ...})
    api.get("/me/").then(res => setCurrentUser(res.data.username));
  }, [showModal, saving]);

  const handleComponentSelect = (dataSourceId, componentId) => {
    setSelectedComponents(prev => ({
      ...prev,
      [dataSourceId]: componentId
    }));
  };

  const handleShowLogs = async (s) => {
    setLogsScenarioName(s.scenario_name);
    try {
      const res = await api.get(`/scenarios/${s.scenario_id}/logs/`);
      setLogs(res.data); // [{timestamp, message, progress}]
      console.log(res.data);
      setShowLogsModal(true);
    } catch (err) {
      alert(t("failedLoadLogs"));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const componentsArr = Object.entries(selectedComponents).map(([dsId, compId]) => ({
        data_source_id: Number(dsId),
        component_id: compId
      }));
      await api.post("/scenarios/create/", {
        scenario_name: scenarioName,
        description,
        components: componentsArr
      });
      setShowModal(false);
      setScenarioName("");
      setDescription("");
      setSelectedComponents({});
    } catch (err) {
      alert("Error: " + err.message);
    }
    setSaving(false);
  };


  // Filter scenarios by search and user
  const filteredScenarios = scenarios.filter(s => {
    const matchesSearch = s.scenario_name.toLowerCase().includes(searchText.toLowerCase());
    const matchesUser = !showOnlyUser || (s.created_by === currentUser);
    return matchesSearch && matchesUser;
  });

  const sortedScenarios = [...filteredScenarios].sort((a, b) => {
    let aVal = a[sortKey];
    let bVal = b[sortKey];

    // Handle dates
    if (sortKey.includes("date") || sortKey === "start_date" || sortKey === "end_date") {
      aVal = aVal ? new Date(aVal) : new Date(0);
      bVal = bVal ? new Date(bVal) : new Date(0);
      return sortAsc ? aVal - bVal : bVal - aVal;
    }

    // Handle boolean
    if (typeof aVal === "boolean" || typeof bVal === "boolean") {
      return sortAsc ? (aVal === bVal ? 0 : aVal ? -1 : 1) : (aVal === bVal ? 0 : aVal ? 1 : -1);
    }

    // Default string/number
    aVal = aVal || "";
    bVal = bVal || "";
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  const handleSort = key => {
    if (sortKey === key) {
      setSortAsc(a => !a);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };
  return (
    <Card className="p-4">
      <div className="d-flex align-items-center mb-3 justify-content-between">
        <div className="d-flex align-items-center gap-3">
          <h4 className="mb-0">Scenarios</h4>
          <Form.Control
            type="text"
            placeholder={t("search")}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ maxWidth: 250 }}
          />
        </div>
        <div className="d-flex gap-3 align-items-center">
          <Form.Check
            type="switch"
            id="showOnlyUserSwitch"
            label={t("show mine")}
            checked={showOnlyUser}
            onChange={() => setShowOnlyUser(v => !v)}
            style={{ fontWeight: "bold" }}
          />
          {role !== "guest" && (
            <>
              <Button variant="primary" onClick={() => setShowModal(true)}>
                {t("createScenario")}
              </Button>
              <Button variant="warning" onClick={() => setShowStartModal(true)}>
                {t("startScenario")}
              </Button>
              <Button variant="info" onClick={() => setShowWorkerPanel(true)}>
                {t("Worker Status")}
              </Button>
            </>
          )}
        </div>
      </div>

      <ScenarioTable
        scenarios={sortedScenarios}
        sortKey={sortKey}
        sortAsc={sortAsc}
        onSort={handleSort}
        onShowLogs={handleShowLogs}
      />
      {/* Create Scenario Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>{t("createScenario")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>{t("componentName")}</Form.Label>
              <Form.Control
                value={scenarioName}
                onChange={e => setScenarioName(e.target.value)}
                placeholder={t("enterComponentName")}
                autoFocus
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{t("description")}</Form.Label>
              <Form.Control
                as="textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t("enterDescription")}
                rows={2}
              />
            </Form.Group>

            {availableComponents.map(ds => (
              <Form.Group key={ds.data_source_id} className="mb-3">
                <Form.Label>
                  <strong>{ds.data_source_name}</strong>
                </Form.Label>
                <Form.Select
                  value={selectedComponents[ds.data_source_id] || ""}
                  onChange={e => handleComponentSelect(ds.data_source_id, Number(e.target.value))}
                  style={{ maxWidth: 400 }}
                >
                  <option value="">{t("selectComponent")}</option>
                  {ds.components.map(comp => (
                    <option key={comp.id} value={comp.id}>
                      {comp.name} ({comp.description})
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            ))}
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button variant="success" onClick={handleSave} disabled={saving || !scenarioName}>
            Save Scenario
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal show={showLogsModal} onHide={() => setShowLogsModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>{t("Log of scenario:")} {logsScenarioName}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: "400px", overflowY: "auto" }}>
          <Table bordered size="sm">
            <thead>
              <tr>
                <th>{t("time")}</th>
                <th>{t("message")}</th>
                <th>{t("progress")}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={i}>
                  <td>{new Date(log.timestamp).toLocaleString()}</td>
                  <td>{log.message}</td>
                  <td>{log.progress}%</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowLogsModal(false)}>
            {t("close")}
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal show={showWorkerPanel} onHide={() => setShowWorkerPanel(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Worker Status Panel</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <WorkerStatusPanel />
        </Modal.Body>
      </Modal>
      {/* Start Scenario Modal */}
      <StartScenarioModal
        show={showStartModal}
        onHide={() => setShowStartModal(false)}
        scenarios={sortedScenarios}
        currentUser={currentUser}
        onStarted={fetchScenarios}
      />
    </Card>
  );
}