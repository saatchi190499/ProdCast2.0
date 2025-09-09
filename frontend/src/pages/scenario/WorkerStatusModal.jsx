import { useEffect, useState } from "react";
import { Card, Table, Spinner } from "react-bootstrap";
import api from "../../utils/axiosInstance";
import { useTranslation } from "react-i18next";

function BrandBadge({ text }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.15rem .5rem",
        borderRadius: 999,
        background: "var(--brand-50a)",
        color: "var(--brand-800)",
        border: "1px solid var(--brand-outline)",
        fontWeight: 600,
        fontSize: "0.8rem",
      }}
    >
      {text}
    </span>
  );
}

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

  const TableWrapper = ({ title, children }) => (
    <div className="mb-4">
      <h6 className="ds-title mb-2">{title}</h6>
      <div className="ds-table-wrapper brand-scroll">{children}</div>
    </div>
  );

  const renderWorkerTable = (workers = []) => (
    <TableWrapper title={t("servers")}>
      <Table bordered hover size="sm" className="ds-table">
        <thead className="ds-thead">
          <tr>
            <th>{t("server")}</th>
            <th>{t("status")}</th>
          </tr>
        </thead>
        <tbody>
          {workers.length > 0 ? (
            workers.map((w, idx) => (
              <tr key={idx} className="ds-row">
                <td>{w.worker}</td>
                <td>
                  <BrandBadge text={w.status} />
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="2" className="text-center text-muted">
                {t("noWorkersFound")}
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </TableWrapper>
  );

  const renderTable = (items = [], titleKey) => (
    <TableWrapper title={t(titleKey)}>
      <Table bordered hover size="sm" className="ds-table">
        <thead className="ds-thead">
          <tr>
            <th>{t("scenarioId")}</th>
            <th>{t("componentName")}</th>
            <th>{t("status")}</th>
            <th>{t("description")}</th>
          </tr>
        </thead>
        <tbody>
          {items?.length > 0 ? (
            items.map((s) => (
              <tr key={s.id || s.task_id} className="ds-row">
                <td>{s.id || "—"}</td>
                <td>{s.name}</td>
                <td><BrandBadge text={titleKey} /></td>
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
    </TableWrapper>
  );

  if (loading) {
    return (
      <Card className="ds-card p-4 text-center">
        <Spinner animation="border" /> {t("loading")}
      </Card>
    );
  }

  if (!statuses) {
    return (
      <Card className="ds-card p-4 text-center" style={{ color: "var(--brand-800)" }}>
        {t("failedLoadWorkers")}
      </Card>
    );
  }

  return (
    <Card className="ds-card p-4">
      <h4 className="ds-heading mb-3">{t("serverStatus")}</h4>

      {renderWorkerTable(statuses.workers)}
      {renderTable(statuses.PENDING, "PENDING")}
      {renderTable(statuses.STARTED, "STARTED")}
      {renderTable(statuses.SUCCESS, "SUCCESS")}
      {renderTable(statuses.FAILURE, "FAILURE")}
      {renderTable(statuses.QUEUED, "QUEUED")}
    </Card>
  );
}