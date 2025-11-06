// DataSourcePage.jsx
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../utils/axiosInstance";
import {
  Spinner,
  Alert,
  Card,
  Table,
  Modal,
  Button,
  Form
} from "react-bootstrap";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import "./DataSourcePage.css";

export default function DataSourcePage() {
  const { sourceName } = useParams();
  const { user, role } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [components, setComponents] = useState([]);
  const [sourceType, setSourceType] = useState(null); // 👈 INPUT / OUTPUT / PROCESS
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [newComponent, setNewComponent] = useState({
    name: "",
    description: "",
    file: null
  });

  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [showOnlyUser, setShowOnlyUser] = useState(false);

  // --- helpers ---
  const formatDate = (iso) => {
    if (!iso) return "";
    const date = new Date(iso);
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // --- fetch data ---
  useEffect(() => {
    // fetch components
    api
      .get(`/data-sources/${sourceName}/components/`)
      .then((res) => {
        setComponents(res.data);
        setLoading(false);
      })
      .catch(() => {
        setError(t("loadErrorComponents"));
        setLoading(false);
      });

    // fetch type
    api
      .get("/data-sources/")
      .then((res) => {
        const src = res.data.find(
          (d) =>
            d.data_source_name.toLowerCase() === sourceName.toLowerCase()
        );
        setSourceType(src?.data_source_type || null);
      })
      .catch(() => setSourceType(null));
  }, [sourceName, t]);

  // --- sorting & filtering ---
  const sortedComponents = [...components]
    .sort((a, b) => {
      if (!sortKey) return 0;
      const valA = a[sortKey] || "";
      const valB = b[sortKey] || "";
      return sortAsc
        ? valA.toString().localeCompare(valB.toString())
        : valB.toString().localeCompare(valA.toString());
    })
    .sort((a, b) => {
      // always bring current user's components up
      const isAUser = a.created_by === user?.username;
      const isBUser = b.created_by === user?.username;
      return isAUser === isBUser ? 0 : isAUser ? -1 : 1;
    });

  const filteredComponents = sortedComponents
    .filter((c) =>
      c.name.toLowerCase().includes(searchText.toLowerCase())
    )
    .filter((c) => !showOnlyUser || c.created_by === user?.username);

  // --- handlers ---
  const handleCreate = async () => {
    const formData = new FormData();
    formData.append("name", newComponent.name);
    formData.append("description", newComponent.description);
    formData.append("data_source", sourceName);

    if (sourceName === "Models" && newComponent.file) {
      formData.append("file", newComponent.file);
    }

    try {
      const res = await api.post("/components/", formData);
      setShowModal(false);
      setNewComponent({ name: "", description: "", file: null });

      if (sourceName === "Events") {
        navigate(`/components/events/${res.data.id}`);
        return;
      }

      if (sourceName === "Workflows") {
        navigate(`/components/workflows/${res.data.id}`);
        return;
      }

      if (sourceName === "PI System") {
        navigate(`/components/pi/${res.data.id}`);
        return;
      }

      if (sourceName === "VisualAnalysis") {
        navigate(`/components/visual-analysis/${res.data.id}`);
        return;
      }

      const response = await api.get(
        `/data-sources/${sourceName}/components/`
      );
      setComponents(response.data);
    } catch {
      alert(t("createError"));
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const handleDelete = async (id, createdBy) => {
    if (user?.username !== createdBy && role !== "admin") {
      alert(t("deleteOnlyAuthor"));
      return;
    }
    if (!window.confirm(t("deleteConfirm"))) return;
    try {
      await api.delete(`/components/${id}/`);
      setComponents((prev) => prev.filter((c) => c.id !== id));
    } catch {
      alert(t("deleteError"));
    }
  };

  // --- loading & error states ---
  if (loading) return <Spinner animation="border" />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  // --- render ---
  return (
    <div className="ds-card p-4">
      <Card.Body>
        {/* Modal for add component (hidden if OUTPUT) */}
        {sourceType !== "OUTPUT" && (
          <Modal show={showModal} onHide={() => setShowModal(false)}>
            <Modal.Header closeButton>
              <Modal.Title className="ds-title">
                {t("addComponent")}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>{t("componentName")}</Form.Label>
                  <Form.Control
                    className="ds-input"
                    type="text"
                    value={newComponent.name}
                    onChange={(e) =>
                      setNewComponent({
                        ...newComponent,
                        name: e.target.value
                      })
                    }
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>{t("componentDescription")}</Form.Label>
                  <Form.Control
                    className="ds-input"
                    as="textarea"
                    rows={3}
                    value={newComponent.description}
                    onChange={(e) =>
                      setNewComponent({
                        ...newComponent,
                        description: e.target.value
                      })
                    }
                  />
                </Form.Group>
                {sourceName === "Models" && (
                  <Form.Group className="mb-3">
                    <Form.Label>{t("componentFile")}</Form.Label>
                    <Form.Control
                      className="ds-input"
                      type="file"
                      onChange={(e) =>
                        setNewComponent({
                          ...newComponent,
                          file: e.target.files[0]
                        })
                      }
                    />
                  </Form.Group>
                )}
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button
                className="btn-ghost"
                onClick={() => setShowModal(false)}
                variant="none"
              >
                {t("cancel")}
              </Button>
              <Button
                className="btn-brand"
                onClick={handleCreate}
                variant="none"
              >
                {t("create")}
              </Button>
            </Modal.Footer>
          </Modal>
        )}

        {/* Header row */}
        <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div className="d-flex align-items-center gap-3">
            <Card.Title className="mb-0 ds-heading">
              {sourceName}
            </Card.Title>
            <Form.Control
              type="text"
              placeholder={t("search")}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ maxWidth: 250 }}
              className="ds-input"
            />
          </div>
          <div className="d-flex align-items-center gap-3">
            <Form.Check
              type="switch"
              id="showOnlyUserSwitch"
              label={t("show mine")}
              checked={showOnlyUser}
              onChange={() => setShowOnlyUser((v) => !v)}
              className="brand-switch fw-semibold"
            />
            {sourceName === "Events" && (
              <Button
                onClick={() => navigate("/components/events/compare")}
                variant="none"
                className="btn-secondary"
              >
                Compare
              </Button>
            )}
            {/* Add button only if not guest and not OUTPUT */}
            {role !== "guest" && sourceType !== "OUTPUT" && (
              <Button
                onClick={() => setShowModal(true)}
                variant="none"
                className="btn-brand"
              >
                {t("addComponent")}
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        {components.length === 0 ? (
          <p>{t("noComponents")}</p>
        ) : (
          <div
            style={{
              maxHeight: "calc(100vh - 250px)",
              overflowY: "auto"
            }}
          >
            <Table
              bordered
              size="sm"
              className="rounded table-hover ds-table"
            >
              <thead className="sticky-top ds-thead">
                <tr>
                  <th
                    onClick={() => handleSort("name")}
                    className={`sortable ${sortKey === "name" ? "sorted" : ""
                      }`}
                  >
                    {t("componentName")}
                    {sortKey === "name" && (sortAsc ? " ▲" : " ▼")}
                  </th>
                  <th
                    onClick={() => handleSort("created_date")}
                    className={`sortable ${sortKey === "created_date" ? "sorted" : ""
                      }`}
                  >
                    {t("created")}
                    {sortKey === "created_date" &&
                      (sortAsc ? " ▲" : " ▼")}
                  </th>
                  <th
                    onClick={() => handleSort("created_by")}
                    className={`sortable ${sortKey === "created_by" ? "sorted" : ""
                      }`}
                  >
                    {t("author")}
                    {sortKey === "created_by" &&
                      (sortAsc ? " ▲" : " ▼")}
                  </th>
                  <th
                    onClick={() => handleSort("last_updated")}
                    className={`sortable ${sortKey === "last_updated" ? "sorted" : ""
                      }`}
                  >
                    {t("updated")}
                    {sortKey === "last_updated" &&
                      (sortAsc ? " ▲" : " ▼")}
                  </th>
                  <th>{t("file")}</th>
                  <th
                    onClick={() => handleSort("description")}
                    className={`sortable ${sortKey === "description" ? "sorted" : ""
                      }`}
                  >
                    {t("componentDescription")}
                    {sortKey === "description" &&
                      (sortAsc ? " ▲" : " ▼")}
                  </th>
                  <th>{t("actions") || "Actions"}</th>
                </tr>
              </thead>

              <tbody>
                {filteredComponents.map((c) => (
                  <tr
                    key={c.id}
                    className="ds-row"
                    onDoubleClick={() => {
                      if (sourceName === "Events") {
                        if (user?.username === c.created_by || role === "admin") {
                          navigate(`/components/events/${c.id}`);
                        } else {
                          alert(t("editOnlyAuthor"));
                        }
                      }
                      if (sourceName === "Workflows") {
                        if (user?.username === c.created_by || role === "admin") {
                          navigate(`/components/workflows/${c.id}`);
                        } else {
                          alert(t("editOnlyAuthor"));
                        }
                      }
                      if (sourceName === "PI System") {
                        if (user?.username === c.created_by || role === "admin") {
                          navigate(`/components/pi/${c.id}`);
                        } else {
                          alert(t("editOnlyAuthor"));
                        }
                      }
                      if (sourceName === "VisualAnalysis") {
                        if (user?.username === c.created_by || role === "admin") {
                          navigate(`/components/visual-analysis/${c.id}`);
                        } else {
                          alert(t("editOnlyAuthor"));
                        }
                      }
                      if (sourceName === "Decline Curves") {
                        if (user?.username === c.created_by || role === "admin") {
                          navigate(`/components/decline-curves/${c.id}`);
                        } else {
                          alert(t("editOnlyAuthor"));
                        }
                      }
                    }}
                  >
                    <td>{c.name}</td>
                    <td>{formatDate(c.created_date) || "—"}</td>
                    <td>{c.created_by || "—"}</td>
                    <td>{formatDate(c.last_updated) || "—"}</td>
                    <td>
                      {c.file ? (
                        <a
                          href={`${c.file}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="brand-link"
                        >
                          📥 {t("download")}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{c.description}</td>
                    <td className="d-flex gap-2">
                      {(user?.username === c.created_by || role === "admin") && (
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => handleDelete(c.id, c.created_by)}
                          className="btn-danger-outline"
                        >
                          {t("delete")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card.Body>
    </div>
  );
}
