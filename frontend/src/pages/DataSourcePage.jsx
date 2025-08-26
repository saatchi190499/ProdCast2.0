// DataSourcePage.jsx
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../utils/axiosInstance";
import { Spinner, Alert, Card, Table, Modal, Button, Form } from "react-bootstrap";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";

export default function DataSourcePage() {
  const { sourceName } = useParams();
  const { user, role } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [newComponent, setNewComponent] = useState({ name: "", description: "", file: null });
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [searchText, setSearchText] = useState("");

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
      // всегда поднимаем компоненты текущего пользователя наверх
      const isAUser = a.created_by === user?.username;
      const isBUser = b.created_by === user?.username;
      return isAUser === isBUser ? 0 : isAUser ? -1 : 1;
    });

  const filteredComponents = sortedComponents.filter(c =>
    c.name.toLowerCase().includes(searchText.toLowerCase())
  );


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
        navigate(`/components/${res.data.id}/events`);
        return;
      }

      const response = await api.get(`/data-sources/${sourceName}/components/`);
      setComponents(response.data);
    } catch (err) {
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
      setComponents(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      alert(t("deleteError"));
    }
  };

  useEffect(() => {
    api.get(`/data-sources/${sourceName}/components/`)
      .then(res => {
        setComponents(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError(t("loadErrorComponents"));
        setLoading(false);
      });
  }, [sourceName]);

  if (loading) return <Spinner animation="border" />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <Card>
      <Card.Body>
        <Modal show={showModal} onHide={() => setShowModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>{t("addComponent")}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>{t("componentName")}</Form.Label>
                <Form.Control
                  type="text"
                  value={newComponent.name}
                  onChange={(e) => setNewComponent({ ...newComponent, name: e.target.value })}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>{t("componentDescription")}</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={newComponent.description}
                  onChange={(e) => setNewComponent({ ...newComponent, description: e.target.value })}
                />
              </Form.Group>
              {sourceName === "Models" && (
                <Form.Group className="mb-3">
                  <Form.Label>{t("componentFile")}</Form.Label>
                  <Form.Control
                    type="file"
                    onChange={(e) => setNewComponent({ ...newComponent, file: e.target.files[0] })}
                  />
                </Form.Group>
              )}
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {t("cancel")}
            </Button>
            <Button variant="primary" onClick={handleCreate}>
              {t("create")}
            </Button>
          </Modal.Footer>
        </Modal>

        <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <Card.Title className="mb-0">
            📘 {t("componentsFor")}: {sourceName}
          </Card.Title>
          <Form.Control
            type="text"
            placeholder={t("search")}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ maxWidth: 250 }}
          />
          <Button onClick={() => setShowModal(true)} variant="success">
            ➕ {t("addComponent")}
          </Button>
        </div>
        {components.length === 0 ? (
          <p>{t("noComponents")}</p>
        ) : (
          <div style={{ maxHeight: "calc(100vh - 250px)", overflowY: "auto" }}>
            <Table bordered size="sm" className="rounded table-hover">
              <thead className="table-secondary sticky-top">
                <tr>
                  <th onClick={() => handleSort("name")} style={{ cursor: "pointer" }}>
                    {t("componentName")} ⬍
                  </th>
                  <th onClick={() => handleSort("created_date")} style={{ cursor: "pointer" }}>
                    {t("created")} ⬍
                  </th>
                  <th onClick={() => handleSort("created_by")} style={{ cursor: "pointer" }}>
                    {t("author")} ⬍
                  </th>
                  <th onClick={() => handleSort("last_updated")} style={{ cursor: "pointer" }}>
                    {t("updated")} ⬍
                  </th>
                  <th>{t("file")}</th>
                  <th onClick={() => handleSort("description")} style={{ cursor: "pointer" }}>
                    {t("componentDescription")} ⬍
                  </th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {filteredComponents.map(c => (
                  <tr key={c.id}
                    onDoubleClick={() => {
                      if (
                        sourceName === "Events" &&
                        (user?.username === c.created_by || role === "admin")
                      ) {
                        navigate(`/components/${c.id}/events`);
                      } else if (sourceName === "Events") {
                        alert("Только автор или админ может редактировать события.");
                      }
                    }}>
                    <td>{c.name}</td>
                    <td>{formatDate(c.created_date) || "—"}</td>
                    <td>{c.created_by || "—"}</td>
                    <td>{formatDate(c.last_updated) || "—"}</td>
                    <td>
                      {c.file ? (
                        <a
                          href={`http://10.117.8.121:8000${c.file}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                        >
                          📥 {t("download")}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{c.description}</td>
                    <td>
                      {(user?.username === c.created_by || role === "admin") && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(c.id, c.created_by)}
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
    </Card>
  );
}
