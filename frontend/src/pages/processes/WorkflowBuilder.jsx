// WorkflowBuilder.jsx
import React, { useState } from "react";
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  MiniMap,
  Controls,
  Background,
} from "reactflow";
import "reactflow/dist/style.css";
import api from "../../utils/axiosInstance";

export default function WorkflowBuilder({ initialNodes = [], initialEdges = [], workflowId }) {
  const [nodes, setNodes] = useState(
    initialNodes.length ? initialNodes : [
      { id: "1", type: "input", data: { label: "Start" }, position: { x: 250, y: 0 } }
    ]
  );
  const [edges, setEdges] = useState(initialEdges);
  const [pythonCode, setPythonCode] = useState("# Python code will appear here\n");

  const onConnect = (params) => setEdges((eds) => addEdge(params, eds));

  const generatePythonCode = () => {
    let code = "def main():\n";
    nodes.forEach((node) => {
      if (node.type === "variable") {
        code += `    ${node.data.name} = ${node.data.value}\n`;
      }
      if (node.type === "function") {
        code += `    ${node.data.name}(${(node.data.args || []).join(", ")})\n`;
      }
      if (node.type === "loop") {
        code += `    for i in range(${node.data.range || 1}):\n        pass\n`;
      }
      if (node.type === "condition") {
        code += `    if ${node.data.condition || "True"}:\n        pass\n`;
      }
    });
    setPythonCode(code);
  };

  const saveWorkflow = async () => {
    try {
      await api.put(`/components/workflows/${workflowId}/`, {
        nodes,
        edges,
        python_code: pythonCode
      });
      alert("Workflow saved!");
    } catch {
      alert("Save failed.");
    }
  };

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Workflow canvas */}
      <div style={{ flex: 2 }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={setNodes}
            onEdgesChange={setEdges}
            onConnect={onConnect}
            fitView
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>
        </ReactFlowProvider>

        <div style={{ marginTop: "10px" }}>
          <button onClick={generatePythonCode}>Generate Code</button>
          <button onClick={saveWorkflow} style={{ marginLeft: "10px" }}>
            Save Workflow
          </button>
        </div>
      </div>

      {/* Python code panel */}
      <div style={{ flex: 1, background: "#222", color: "#0f0", padding: 10 }}>
        <pre>{pythonCode}</pre>
      </div>
    </div>
  );
}
