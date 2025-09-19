// WorkflowRecordsPage.jsx
import { useParams } from "react-router-dom";
import WorkflowBuilder from "./WorkflowEditor";
import { useEffect, useState } from "react";
import api from "../../utils/axiosInstance";

export default function WorkflowRecordsPage() {
    const { id } = useParams();
    const [workflow, setWorkflow] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1. сначала пробуем localStorage
        const savedNodes = localStorage.getItem(`workflow-${id}-nodes`);
        const savedEdges = localStorage.getItem(`workflow-${id}-edges`);

        if (savedNodes || savedEdges) {
            setWorkflow({
                id,
                name: `Local Draft ${id}`,
                nodes: savedNodes ? JSON.parse(savedNodes) : [],
                edges: savedEdges ? JSON.parse(savedEdges) : [],
            });
            setLoading(false);
        } else {
            // 2. если нет локального → тянем из API
            api.get(`/components/workflows/${id}/`)
                .then((res) => setWorkflow(res.data))
                .finally(() => setLoading(false));
        }
    }, [id]);


    if (loading) return <p>Loading...</p>;
    const normalizeNodes = (nodes = []) =>
        nodes.map((n, idx) => ({
            ...n,
            position: n.position || { x: idx * 150, y: idx * 100 }
        }));


    return (
        <div style={{ height: "100vh" }}>
            <h4 style={{ padding: "10px" }}>
                Workflow: {workflow?.name}
            </h4>
            <WorkflowBuilder
                initialNodes={normalizeNodes(workflow?.nodes || [])}
                initialEdges={workflow?.edges || []}
                workflowId={id}
            />
        </div>
    );
}
