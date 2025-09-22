import React, { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import NotebookCell from "./NotebookCell";
import PropertyEditor from "./PropertyEditor";
import api from "../../utils/axiosInstance";
import { blockToPythonFromCell } from "./utils/blockToPythonFromCell";
import { usePetexTips } from "./context/PetexTipsContext";
import { useMonaco } from "@monaco-editor/react";
import { registerPythonProviders } from "./utils/registerPythonProviders";


export default function NotebookEditor() {
  const [cells, setCells] = useState([]);
  const [selectedCell, setSelectedCell] = useState(null);
  const [outputs, setOutputs] = useState({});     // id -> {stdout, stderr}
  const [stepIdx, setStepIdx] = useState(0);      // index of next cell to run
  const [isRunning, setIsRunning] = useState(false);
  const { tips, refreshTips, deleteVar, addOrUpdateVar } = usePetexTips();
  const monaco = useMonaco();

  // 🔹 Centralized provider registration
  useEffect(() => {
    if (monaco && tips) {
      registerPythonProviders(monaco, tips);
    }
  }, [monaco, tips]);

  const createCell = (type) => {
    switch (type) {
      case "code":
        return { id: uuidv4(), type, source: "" };
      case "variable":
        return { id: uuidv4(), type, metadata: { variables: [{ name: "x", type: "int", value: 0 }] } };
      case "function":
        return { id: uuidv4(), type, metadata: { name: "my_func", params: [], body: "pass" } };
      case "loop":
        return { id: uuidv4(), type, metadata: { indexVar: "i", count: 5, body: "pass" } };
      case "condition":
        return { id: uuidv4(), type, metadata: { condition: "True" } };
      default:
        return { id: uuidv4(), type: "code", source: "" };
    }
  };

  const addCell = (type) => setCells((p) => [...p, createCell(type)]);
  const updateCell = (id, updated) => setCells((p) => p.map(c => c.id === id ? { ...c, ...updated } : c));
  const removeCell = async (id) => {
    const cell = cells.find((c) => c.id === id);

    // if variable cell → delete its vars from backend
    if (cell?.type === "variable") {
      (cell.metadata?.variables || []).forEach(async (v) => {
        try {
          await api.post("/delete_var/", { name: v.name });
        } catch (err) {
          console.warn("Failed to delete var:", v.name, err);
        }
      });
    }

    setCells((p) => p.filter((c) => c.id !== id));
    setOutputs((o) => {
      const n = { ...o };
      delete n[id];
      return n;
    });

    refreshTips(); // refresh autocomplete tips
  };

  const runOne = async (cell) => {
    const code = blockToPythonFromCell(cell);
    try {
      const res = await api.post("/run_cell/", { code });
      const { stdout, stderr, variables } = res.data;

      setOutputs((prev) => ({
        ...prev,
        [cell.id]: { stdout, stderr, code },
      }));

      // 🔹 update context vars instantly
      if (variables) {
        const current = new Set(Object.keys(tips.__variables__ || {}));
        const fresh = new Set(Object.keys(variables));

        // removed vars
        current.forEach((name) => {
          if (!fresh.has(name)) deleteVar(name);
        });

        // add/update vars
        Object.entries(variables).forEach(([name, info]) => {
          addOrUpdateVar(name, info);
        });
      }
    } catch (err) {
      setOutputs((prev) => ({
        ...prev,
        [cell.id]: { stdout: "", stderr: String(err), code },
      }));
    }
  };

  const runAll = async () => {
    if (!cells.length) return;
    setIsRunning(true);
    try {
      for (let i = 0; i < cells.length; i++) {
        // sequential run to mimic notebook behavior
        // eslint-disable-next-line no-await-in-loop
        await runOne(cells[i]);
      }
      setStepIdx(cells.length);
    } finally {
      setIsRunning(false);
    }
  };

  const runStep = async () => {
    if (!cells.length) return;
    if (stepIdx >= cells.length) { setStepIdx(0); return; }
    setIsRunning(true);
    try {
      await runOne(cells[stepIdx]);
      setStepIdx((i) => i + 1);
    } finally {
      setIsRunning(false);
    }
  };

  const resetKernel = async () => {
    try { await api.post("/reset_context/"); } catch { /* ignore */ }
    setOutputs({});
    setStepIdx(0);
  };

  return (
    <div style={{ padding: 16 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <button onClick={() => addCell("code")}>+ Code</button>
        <button onClick={() => addCell("variable")}>+ Variable</button>
        <button onClick={() => addCell("function")}>+ Function</button>
        <button onClick={() => addCell("loop")}>+ Loop</button>
        <button onClick={() => addCell("condition")}>+ Condition</button>

        <div style={{ width: 1, height: 18, background: "#ddd", margin: "0 8px" }} />

        <button onClick={resetKernel}>⟲ Reset Kernel</button>
        <button onClick={runStep} disabled={isRunning}>▶ Step ({Math.min(stepIdx + 1, cells.length)}/{cells.length || 0})</button>
        <button onClick={runAll} disabled={isRunning}>⏭ Run All</button>
      </div>

      {/* Cells */}
      {cells.map((cell, idx) => {
        const isActive = idx === stepIdx;
        const out = outputs[cell.id];

        return (
          <div
            key={cell.id}
            style={{
              border: `2px solid ${isActive ? "#60a5fa" : "#e5e7eb"}`,
              borderRadius: 8,
              padding: 10,
              marginBottom: 10,
              background: "#fff",
              boxShadow: isActive ? "0 0 0 3px #93c5fd33" : "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <strong>{cell.type.toUpperCase()} Cell</strong>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => runOne(cell)} disabled={isRunning}>▶ Run Cell</button>
                {cell.type !== "code" && <button onClick={() => setSelectedCell(cell)}>✏️ Edit</button>}
                <button onClick={() => removeCell(cell.id)}>🗑️ Delete</button>
              </div>
            </div>

            {cell.type === "code" ? (
              <NotebookCell
                cell={cell}
                onChange={(updated) => updateCell(cell.id, updated)}
                output={out}
              />
            ) : (
              <>
                {/* Preview of generated Python */}
                <pre style={{ background: "#f9fafb", padding: 8, borderRadius: 6, fontSize: 12, marginBottom: 8 }}>
                  {blockToPythonFromCell(cell)}
                </pre>
                {/* Output */}
                {out && (
                  <div style={{ marginTop: 6 }}>
                    {out.stderr ? (
                      <div style={{ color: "red", fontWeight: 500 }}>
                        ❌ {out.stderr}
                      </div>
                    ) : (
                      <span style={{ color: "green", fontWeight: 500 }}>✔️</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* Modal for PropertyEditor */}
      {selectedCell && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setSelectedCell(null)}
        >
          <div
            style={{ background: "#fff", padding: 20, borderRadius: 12, minWidth: 560, maxHeight: "80vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <PropertyEditor
              node={selectedCell}
              onSave={(updatedMeta) => {
                updateCell(selectedCell.id, { metadata: updatedMeta });
                setSelectedCell(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
