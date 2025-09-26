// frontend/src/pages/SettingsPage.jsx
import { useEffect, useState } from "react";
import api from "../../utils/axiosInstance";

export default function ServerManager() {
  const [servers, setServers] = useState([]);

  const fetchServers = async () => {
    const res = await api.get("servers/");
    setServers(res.data);
  };

  const updateServer = async (id, field, value) => {
    await api.patch(`servers/${id}/`, { [field]: value });
    fetchServers();
  };

  useEffect(() => {
    fetchServers();
  }, []);

  return (
    <div className="container mt-4">
      <h2>Server Settings</h2>
      <table className="table table-bordered table-striped">
        <thead>
          <tr>
            <th>Name</th>
            <th>URL</th>
            <th>Status</th>
            <th>Active</th>
            <th>Allow Scenarios</th>
            <th>Allow Workflows</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {servers.map((srv) => (
            <tr key={srv.server_id}>
              <td>{srv.server_name}</td>
              <td>{srv.server_url}</td>
              <td>{srv.server_status}</td>
              <td>
                <input
                  type="checkbox"
                  checked={srv.is_active}
                  onChange={(e) =>
                    updateServer(srv.server_id, "is_active", e.target.checked)
                  }
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={srv.allow_scenarios}
                  onChange={(e) =>
                    updateServer(
                      srv.server_id,
                      "allow_scenarios",
                      e.target.checked
                    )
                  }
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={srv.allow_workflows}
                  onChange={(e) =>
                    updateServer(
                      srv.server_id,
                      "allow_workflows",
                      e.target.checked
                    )
                  }
                />
              </td>
              <td>{srv.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
