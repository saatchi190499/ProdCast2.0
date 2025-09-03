import { useEffect, useState } from "react";
import { Card, Table, Spinner, Badge } from "react-bootstrap";
import api from "../../utils/axiosInstance";
import { useTranslation } from "react-i18next";

export default function WorkerStatusPanel() {
  const { t } = useTranslation();
  const [statuses, setStatuses] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await api.get("/workers/schedule/");
      setStatuses(res.data);
    } catch (err) {
      console.error("Failed to fetch worker status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const renderWorkerTable = (workers = []) => (
    <Table bordered hover size="sm" className="mb-4">
      <thead className="table-light">
        <tr>
          <th>{t("worker")}</th>
          <th>{t("status")}</th>
        </tr>
      </thead>
      <tbody>
        {workers.length > 0 ? (
          workers.map((w, idx) => (
            <tr key={idx}>
              <td>{w.worker}</td>
              <td>
                <Badge bg={w.status === "pong" ? "success" : "danger"}>
                  {w.status}
                </Badge>
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan="4" className="text-center text-muted">
              {t("noWorkersFound")}
            </td>
          </tr>
        )}
      </tbody>
    </Table>
  );

  const renderTable = (items = [], variant) => (
    <Table bordered hover size="sm" className="mb-4">
      <thead className={`table-${variant}`}>
        <tr>
          <th>{t("scenarioId")}</th>
          <th>{t("name")}</th>
          <th>{t("status")}</th>
          <th>{t("description")}</th>
        </tr>
      </thead>
      <tbody>
        {items.length > 0 ? (
          items.map((s) => (
            <tr key={s.id || s.task_id}>
              <td>{s.id || "—"}</td>
              <td>{s.name}</td>
              <td>
                <Badge bg={variant}>{s.status}</Badge>
              </td>
              <td>{s.description || "—"}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan="4" className="text-center text-muted">
              {t("noTasks")}
            </td>
          </tr>
        )}
      </tbody>
    </Table>
  );

  if (loading) {
    return (
      <Card className="p-4 text-center">
        <Spinner animation="border" /> {t("loading")}
      </Card>
    );
  }

  if (!statuses) {
    return (
      <Card className="p-4 text-center text-danger">
        {t("failedLoadWorkers")}
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h4 className="mb-3">{t("workerStatus")}</h4>
      {renderWorkerTable(statuses.workers)}
      {renderTable(statuses.PENDING, "secondary")}
      {renderTable(statuses.STARTED, "warning")}
      {renderTable(statuses.SUCCESS, "success")}
      {renderTable(statuses.FAILURE, "danger")}
      {renderTable(statuses.QUEUED, "info")}
    </Card>
  );
}
