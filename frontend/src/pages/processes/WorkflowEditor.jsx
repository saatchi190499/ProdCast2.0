import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import ReactFlow, { ReactFlowProvider, addEdge, applyEdgeChanges, applyNodeChanges, MiniMap, Controls, Background, Panel } from "reactflow";
import "reactflow/dist/style.css";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { nodeTypes } from "./nodes";
import PropertyEditor from "./editor/PropertyEditor";
import Executor from "./executor/Executor";
import Modal from "./ui/Modal";
import TBtn from "./ui/TBtn";
import api from "../../utils/axiosInstance";
import { nextId, downloadText } from "./utils/helpers";
import { buildCode } from "./utils/codegen";
import { makePlan, buildDebugQueue } from "./utils/planner";
import { loadPyodideOnce } from "./utils/pyodide";

export default function WorkflowEditor({ initialNodes = [], initialEdges = [], workflowId }) {
    const [nodes, setNodes] = useState(initialNodes);
    const [edges, setEdges] = useState(initialEdges);
    const [modalNode, setModalNode] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [execQueue, setExecQueue] = useState([]);

    const pyodideRef = useRef(null);
    const rf = useRef(null);

    const ensurePyodide = useCallback(async () => {
        if (pyodideRef.current) return pyodideRef.current;
        pyodideRef.current = await loadPyodideOnce();
        return pyodideRef.current;
    }, []);

    const saveWorkflow = async () => {
        try {
            const code = pythonCode || "# empty workflow";
            await api.put(`/components/workflows/${workflowId}/`, {
                nodes,
                edges,
                code_input: code
            });
            alert("Workflow saved!");
        } catch (err) {
            console.error("Failed to save workflow", err);
            alert("Error saving workflow");
        }
    };

    const resetFromServer = async () => {
        try {
            const res = await api.get(`/components/workflows/${workflowId}/`);
            const wf = res.data;

            // обновляем стейт
            setNodes(wf.nodes || []);
            setEdges(wf.edges || []);

            // чистим localStorage
            localStorage.removeItem(`workflow-${workflowId}-nodes`);
            localStorage.removeItem(`workflow-${workflowId}-edges`);

            alert("Workflow reset to server version!");
        } catch (err) {
            console.error("Failed to reset from server", err);
            alert("Error loading workflow from server");
        }
    };

    useEffect(() => {
        const savedNodes = localStorage.getItem(`workflow-${workflowId}-nodes`);
        const savedEdges = localStorage.getItem(`workflow-${workflowId}-edges`);

        if (savedNodes) setNodes(JSON.parse(savedNodes));
        if (savedEdges) setEdges(JSON.parse(savedEdges));
    }, [workflowId]);


    useEffect(() => {
        localStorage.setItem(`workflow-${workflowId}-nodes`, JSON.stringify(nodes));
        localStorage.setItem(`workflow-${workflowId}-edges`, JSON.stringify(edges));
    }, [nodes, edges, workflowId]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const pyo = await ensurePyodide();
            const plan = makePlan(nodes, edges);
            const q = await buildDebugQueue(pyo, plan, nodes);
            if (!cancelled) setExecQueue(q);
        })();
        return () => { cancelled = true; };
    }, [nodes, edges, ensurePyodide]);

    const onNodesChange = useCallback((c) => setNodes((nds) => applyNodeChanges(c, nds)), []);
    const onEdgesChange = useCallback((c) => setEdges((eds) => applyEdgeChanges(c, eds)), []);
    const onConnect = useCallback((params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)), []);

    const onNodeClick = useCallback((_, node) => { setModalNode(node); setIsModalOpen(true); }, []);
    const handleModalClose = () => { setIsModalOpen(false); setModalNode(null); };
    const handleModalSave = (updatedData) => {
        setNodes((nds) => nds.map((n) => n.id === modalNode.id ? { ...n, data: updatedData } : n));
        handleModalClose();
    };

    const addNode = (type, data, x = 120, y = 80) => {
        const id = nextId();
        setNodes((nds) => nds.concat({ id, type, data, position: { x, y } }));
    };

    const addVariable = () => addNode("variable", { label: "Variables", variables: [{ name: "x", type: "int", value: 10 }] }, 80, 120);
    const addFunction = () => addNode("function", { label: "My Function", name: "my_fn", params: [{ name: "x", type: "any", default: "" }], body: "print(x)" }, 340, 120);
    const addLoop = () => addNode("loop", { label: "Loop", indexVar: "i", count: 5, countVar: "", body: "print(i)" }, 80, 300);
    const addCondition = () => addNode("condition", { label: "If block", condition: "x > 0" }, 340, 300);

    const clearAll = () => { setNodes([]); setEdges([]); };
    const exportPython = () => {
        let code = "";
        if (nodes.length) {
            const sorted = [...nodes].sort((a, b) => (a.position.x - b.position.x) || (a.position.y - b.position.y));
            code = buildCode(sorted[0].id, nodes, edges, new Set());
        }
        downloadText("workflow.py", code.trimEnd());
    };

    const pythonCode = useMemo(() => {
        if (!nodes.length) return "# add blocks to generate code";
        const sorted = [...nodes].sort((a, b) => (a.position.x - b.position.x) || (a.position.y - b.position.y));
        return buildCode(sorted[0].id, nodes, edges, new Set()).trimEnd();
    }, [nodes, edges]);

    return (
        <div style={{ display: "flex", height: "100vh" }}>
            <ReactFlowProvider>
                <div style={{ flex: 1, borderRight: "1px solid #e5e7eb" }}>
                    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
                        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
                        onConnect={onConnect} onNodeClick={onNodeClick} fitView>
                        <MiniMap pannable zoomable />
                        <Controls />
                        <Background variant="dots" gap={16} size={1} />
                        <Panel position="top-left">
                            <div style={{ display: "flex", gap: 8, background: "#fff", padding: 8, borderRadius: 12 }}>

                                <TBtn onClick={addVariable}>+ Variables</TBtn>
                                <TBtn onClick={addFunction}>+ Function</TBtn>
                                <TBtn onClick={addLoop}>+ Loop</TBtn>
                                <TBtn onClick={addCondition}>+ IF</TBtn>
                                <TBtn onClick={() => addNode(
                                    "body",
                                    { label: "Body", body: "print('Hello from body')" },
                                    600,
                                    300
                                )}>+ Body</TBtn>
                                <TBtn onClick={clearAll}>Clear</TBtn>
                                <TBtn onClick={exportPython}>Export .py</TBtn>
                                <TBtn onClick={resetFromServer}>Reset ⟲</TBtn>
                                <TBtn onClick={saveWorkflow} style={{ background: "#10b981", color: "#fff" }}>Save Workflow</TBtn>
                            </div>

                        </Panel>
                    </ReactFlow>
                </div>
            </ReactFlowProvider>

            <div style={{ width: 600, display: "grid", gridTemplateRows: "1fr 1fr", gap: 12, padding: 12, background: "#fafafa" }}>
                <div style={{ background: "#0b1021", borderRadius: 12, padding: 12 }}>
                    <div style={{ fontWeight: 700, color: "#86efac" }}>Generated Python</div>
                    <SyntaxHighlighter language="python" style={vscDarkPlus} showLineNumbers>
                        {pythonCode}
                    </SyntaxHighlighter>
                </div>
                <Executor
                    queue={execQueue}
                    onStepChange={(idx, item) => {
                        setNodes((nds) =>
                            nds.map((n) => ({
                                ...n,
                                data: { ...n.data, __active: n.id === item.nodeId }, // подсвечиваем текущий
                            }))
                        );
                    }}
                    onReset={() => {
                        setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, __active: false } })));
                    }}
                />
            </div>

            {modalNode && (
                <Modal isOpen={isModalOpen} onClose={handleModalClose}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Block Properties</div>
                    <PropertyEditor node={modalNode} onSave={handleModalSave} />
                </Modal>
            )}
        </div>
    );
}
