// WorkflowRecordsPage.jsx
import { useParams } from "react-router-dom";
import WorkflowBuilder from "./WorkflowBuilder";
import { useEffect, useState } from "react";
import api from "../../utils/axiosInstance";

export default function WorkflowRecordsPage() {
  const { id } = useParams();
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load workflow details (nodes/edges JSON)
    api.get(`/components/workflows/${id}/`)
      .then((res) => {
        setWorkflow(res.data); // expect res.data to have nodes, edges, metadata
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p>Loading...</p>;

  return (
    <div style={{ height: "100vh" }}>
      <h4 style={{ padding: "10px" }}>
        Workflow: {workflow?.name}
      </h4>
      <WorkflowBuilder
        initialNodes={workflow?.nodes || []}
        initialEdges={workflow?.edges || []}
        workflowId={id}
      />
    </div>
  );
}
