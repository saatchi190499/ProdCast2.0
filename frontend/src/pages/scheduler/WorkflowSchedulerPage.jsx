import { useEffect, useState } from "react";
import api from "../../utils/axiosInstance";
import { FiFileText, FiTrash2, FiPlay, FiClock, FiXCircle, FiLoader, FiCheckCircle } from "react-icons/fi";
import Cron from "react-js-cron";
import "react-js-cron/dist/styles.css"; // стандартные стили


export default function WorkflowSchedulerPage() {
  const [schedulers, setSchedulers] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [form, setForm] = useState({
    workflow: "",
    cron_expression: "0 0 * * *",
  });

  // --- Логи/история запусков ---
  const [runs, setRuns] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [activeScheduler, setActiveScheduler] = useState(null);
  const [activeRun, setActiveRun] = useState(null);


  const getStatusIcon = (status) => {
    switch (status) {
      case "QUEUED":
      case "PENDING":
        return <FiClock className="text-warning me-1" />;
      case "STARTED":
        return <FiLoader className="text-primary me-1" style={{ animation: "spin 1s linear infinite" }} />;
      case "SUCCESS":
        return <FiCheckCircle className="text-success me-1" />;
      case "FAILURE":
      case "ERROR":
        return <FiXCircle className="text-danger me-1" />;
      default:
        return <FiClock className="text-muted me-1" />;
    }
  };

  const runNow = async (id) => {
    try {
      await api.post(`workflow-schedulers/${id}/run_now/`);
      alert("Workflow scheduled to run now");
      fetchSchedulers();
    } catch (err) {
      alert("Ошибка запуска расписания");
      console.error(err);
    }
  };

  const fetchSchedulers = async () => {
    const res = await api.get("workflow-schedulers/");
    setSchedulers(res.data);
  };

  const fetchWorkflows = async () => {
    const res = await api.get("components/workflows/all/");
    setWorkflows(res.data);
  };

  const fetchRuns = async (workflowId) => {
    const res = await api.get(`workflow-runs/?workflow_id=${workflowId}`);
    setRuns(res.data);
    if (res.data.length > 0) {
      setActiveRun(res.data[0]); // первый (последний по времени)
    }
  };

  const openLogs = async (scheduler) => {
    setActiveScheduler(scheduler);
    await fetchRuns(scheduler.workflow); // ⚠️ scheduler должен содержать поле workflow (id)
    setShowLogs(true);
  };

  const closeLogs = () => {
    setShowLogs(false);
    setRuns([]);
    setActiveScheduler(null);
    setActiveRun(null);
  };

  const createScheduler = async (e) => {
    e.preventDefault();
    await api.post("workflow-schedulers/", form);
    setForm({ workflow: "", cron_expression: "0 0 * * *" });
    fetchSchedulers();
  };

  const toggleActive = async (id, value) => {
    await api.patch(`workflow-schedulers/${id}/`, { is_active: value });
    fetchSchedulers();
  };

  const deleteScheduler = async (id) => {
    if (window.confirm("Are you sure you want to delete this schedule?")) {
      await api.delete(`workflow-schedulers/${id}/`);
      fetchSchedulers();
    }
  };

  useEffect(() => {
    fetchSchedulers();
    fetchWorkflows();
  }, []);

  return (
    <div className="container mt-4">
      <div className="ds-card p-4">
        <h2 className="ds-heading mb-4">Workflow Scheduler</h2>

        {/* Create form */}
        <form onSubmit={createScheduler} className="mb-4 row g-3">
          <div className="col-md-4">
            <select
              className="ds-input form-select"
              value={form.workflow}
              onChange={(e) => setForm({ ...form, workflow: e.target.value })}
              required
            >
              <option value="">-- Select Workflow --</option>
              {workflows.map((wf) => (
                <option key={wf.id} value={wf.id}>
                  {wf.component_name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-5">
            <Cron
              value={form.cron_expression}
              setValue={(val) => setForm({ ...form, cron_expression: val })}
              clearButton={false}
              leadingZero
            />
          </div>
          <div className="col-md-3">
            <button type="submit" className="btn btn-brand w-100">
              ➕ Add Schedule
            </button>
          </div>
        </form>

        {/* Table */}
        <table className="table ds-table table-hover">
          <thead className="ds-thead">
            <tr>
              <th>Workflow</th>
              <th>Cron</th>
              <th>Next Run</th>
              <th>Last Run</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedulers.map((s) => (
              <tr key={s.id} className="ds-row">
                <td>{s.workflow_name}</td>
                <td>{s.cron_expression}</td>
                <td>{s.next_run || "-"}</td>
                <td>{s.last_run || "-"}</td>
                <td>
                  <div className="form-check form-switch brand-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={s.is_active}
                      onChange={(e) => toggleActive(s.id, e.target.checked)}
                    />
                  </div>
                </td>
                <td>
                  <div className="d-flex gap-2">
                    <button
                      className="btn btn-brand-outline btn-sm d-flex align-items-center gap-1"
                      onClick={() => openLogs(s)}
                    >
                      <FiFileText size={16} />
                      Logs
                    </button>

                    <button
                      className="btn btn-brand-outline btn-sm d-flex align-items-center gap-1"
                      onClick={() => runNow(s.id)}
                    >
                      <FiPlay size={16} />
                      Run Now
                    </button>
                    <button
                      className="btn btn-danger-outline btn-sm d-flex align-items-center gap-1"
                      onClick={() => deleteScheduler(s.id)}
                    >
                      <FiTrash2 size={16} />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Logs Modal */}
      {showLogs && (
        <>
          {/* Backdrop */}
          <div
            className="modal-backdrop fade show"
            style={{ backdropFilter: "blur(4px)" }}
          ></div>

          <div className="modal d-block" tabIndex="-1" role="dialog">
            <div className="modal-dialog modal-xl" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    Runs for Workflow #{activeScheduler?.workflow} (
                    {activeScheduler?.workflow_name})
                  </h5>
                  <button type="button" className="btn-close" onClick={closeLogs}></button>
                </div>
                <div className="modal-body">
                  <div className="row">
                    {/* Left column — список запусков */}
                    <div className="col-4 border-end brand-scroll" style={{ maxHeight: "400px", overflowY: "auto" }}>
                      <ul className="list-group">
                        {runs.map((run) => (
                          <li
                            key={run.id}
                            className={`list-group-item d-flex justify-content-between align-items-center ${activeRun?.id === run.id ? "active" : ""}`}
                            style={{ cursor: "pointer" }}
                            onClick={() => setActiveRun(run)}
                          >
                            <span className="d-flex align-items-center">
                              {getStatusIcon(run.status)}
                              {new Date(run.started_at).toLocaleString()}
                            </span>
                            <span
                              className={`badge ${run.status === "SUCCESS" ? "bg-success" :
                                  run.status === "STARTED" ? "bg-primary" :
                                    run.status === "QUEUED" || run.status === "PENDING" ? "bg-warning text-dark" :
                                      run.status === "REMOVED" ? "bg-secondary" :
                                        run.status === "REVOKED" ? "bg-dark" :
                                          "bg-danger"
                                }`}
                            >
                              {run.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Right column — детали запуска */}
                    <div className="col-8">
                      {activeRun ? (
                        <>
                          <h6>Status: {activeRun.status}</h6>
                          <p><b>Started:</b> {new Date(activeRun.started_at).toLocaleString()}</p>
                          {activeRun.finished_at && (
                            <p><b>Finished:</b> {new Date(activeRun.finished_at).toLocaleString()}</p>
                          )}
                          <p><b>Task ID:</b> {activeRun.task_id || "—"}</p>

                          {/* Кнопки управления задачей */}
                          {activeRun.task_id && (
                            <div className="d-flex gap-2 mb-3">
                              <button
                                className="btn btn-danger-outline btn-sm d-flex align-items-center gap-1"
                                onClick={async () => {
                                  if (window.confirm("Удалить задачу из очереди?")) {
                                    try {
                                      await api.delete(
                                        `workflows/task/${activeRun.task_id}/?queue=workflows`
                                      );
                                      alert("Задача удалена");
                                      fetchRuns(activeScheduler.workflow); // обновляем список
                                    } catch (err) {
                                      alert("Ошибка при удалении задачи");
                                      console.error(err);
                                    }
                                  }
                                }}
                              >
                                <FiTrash2 size={14} /> Remove
                              </button>

                              <button
                                className="btn btn-brand-outline btn-sm d-flex align-items-center gap-1"
                                onClick={async () => {
                                  if (window.confirm("Прервать выполнение задачи?")) {
                                    try {
                                      await api.delete(
                                        `workflows/task/${activeRun.task_id}/?queue=workflows&revoke=1`
                                      );
                                      alert("Задача прервана");
                                      fetchRuns(activeScheduler.workflow);
                                    } catch (err) {
                                      alert("Ошибка при остановке задачи");
                                      console.error(err);
                                    }
                                  }
                                }}
                              >
                                <FiXCircle size={14} /> Revoke
                              </button>
                            </div>
                          )}

                          <hr />
                          <h6>Output:</h6>
                          <pre style={{ maxHeight: "200px", overflow: "auto" }}>
                            {activeRun.output || "No output"}
                          </pre>
                          {activeRun.error && (
                            <>
                              <h6 className="text-danger mt-3">Error:</h6>
                              <pre style={{ maxHeight: "200px", overflow: "auto", color: "red" }}>
                                {activeRun.error}
                              </pre>
                            </>
                          )}
                        </>
                      ) : (
                        <p>Select a run from the left</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
