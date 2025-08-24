import { useEffect, useState } from "react";
import api from "../../utils/axiosInstance";

export default function AdminPanel() {
  const [users, setUsers] = useState([]);

  const fetchUsers = async () => {
    const res = await api.get("/users/");
    setUsers(res.data);
  };

  const updateRole = async (id, role) => {
    await api.patch(`/users/${id}/role/`, { role });
    fetchUsers();
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div>
      <table>
        <thead>
          <tr><th>Имя</th><th>Email</th><th>Роль</th><th>Изменить роль</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>
                <select value={u.role} onChange={(e) => updateRole(u.id, e.target.value)}>
                  <option value="admin">admin</option>
                  <option value="user">user</option>
                  <option value="guest">guest</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
