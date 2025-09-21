import { useEffect, useState } from "react";
import api from "../../utils/axiosInstance";
import { Table, Spinner, Alert, Form } from "react-bootstrap";

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUsers = async () => {
    try {
      const res = await api.get("/users/");
      setUsers(res.data);
      setLoading(false);
    } catch (err) {
      setError("Не удалось загрузить список пользователей");
      setLoading(false);
    }
  };

  const updateRole = async (id, role) => {
    try {
      await api.patch(`/users/${id}/role/`, { role });
      fetchUsers();
    } catch {
      setError("Ошибка при обновлении роли");
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  if (loading) return <Spinner animation="border" />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <div className="mt-4">

      <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
        <Table striped bordered hover size="sm" className="rounded table-hover ds-table">
          <thead className="sticky-top ds-thead">
            <tr>
              <th>ID</th>
              <th>Имя</th>
              <th>Email</th>
              <th>Роль</th>
              <th>Изменить роль</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  <Form.Select
                    size="sm"
                    value={u.role}
                    onChange={(e) => updateRole(u.id, e.target.value)}
                  >
                    <option value="admin">admin</option>
                    <option value="user">user</option>
                    <option value="guest">guest</option>
                  </Form.Select>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
