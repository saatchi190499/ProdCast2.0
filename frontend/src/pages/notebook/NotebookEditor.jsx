import React, { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import NotebookCell from "./NotebookCell";
import PropertyEditor from "./PropertyEditor";
import api, { localApi } from "../../utils/axiosInstance";
import { blockToPythonFromCell } from "./utils/blockToPythonFromCell";
import { usePetexTips } from "./context/PetexTipsContext";
import { useMonaco } from "@monaco-editor/react";
import { useParams } from "react-router-dom";
import { registerPythonProviders } from "./utils/registerPythonProviders";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Play,
  Edit3,
  CheckCircle2,
  XCircle,
  Save,
  CheckSquare,
  RotateCcw,
  StepForward
} from "lucide-react";



export default function NotebookEditor() {
  const [cells, setCells] = useState([]);
  const [selectedCell, setSelectedCell] = useState(null);
  const [outputs, setOutputs] = useState({});     // id -> {stdout, stderr}
  const [stepIdx, setStepIdx] = useState(0);      // index of next cell to run
  const [isRunning, setIsRunning] = useState(false);
  const { tips, refreshTips, deleteVar, addOrUpdateVar } = usePetexTips();
  const monaco = useMonaco();
  const { id } = useParams(); // workflow id from route
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [activeVersion, setActiveVersion] = useState("");

  useEffect(() => {
    if (!id) return;
    api.get(`/components/workflows/${id}/`)
      .then(res => setCells(res.data.cells || []))
      .catch(err => console.error("Failed to load workflow", err));
    loadVersions();
  }, [id]);

  const loadVersions = async () => {
  try {
    const res = await api.get(`/components/workflows/${id}/versions/`);
    console.log("versions response:", res.data);   // 👀 check here
    setVersions(res.data.versions || []);
    setActiveVersion(res.data.active || "");
  } catch (err) {
    console.error("Failed to load versions", err);
  }
};


  const saveNotebook = async () => {
    try {
      await api.patch(`/components/workflows/${id}/`, { cells });
      await loadVersions();
      alert("✅ Notebook saved successfully!");
    } catch (err) {
      console.error("Failed to save workflow", err);
      alert("❌ Failed to save notebook");
    }
  };

  const handleVersionChange = async (e) => {
    const ts = e.target.value;
    setSelectedVersion(ts);
    if (!ts) return;
    try {
      const res = await api.get(`/components/workflows/${id}/load_version/`, {
        params: { timestamp: ts },
      });
      setCells(res.data.cells || []);
    } catch (err) {
      console.error("Failed to load version", err);
    }
  };

  const registerVersion = async () => {
    if (!selectedVersion) return;
    try {
      await api.post(`/components/workflows/${id}/register_version/`, {
        timestamp: selectedVersion,
      });
      alert("✅ Version registered!");
      await loadVersions();
    } catch (err) {
      console.error("Failed to register version", err);
      alert("❌ Failed to register version");
    }
  };


  // 🔹 Centralized provider registration
  useEffect(() => {
    if (monaco && tips) {
      registerPythonProviders(monaco, tips);
    }
  }, [monaco, tips]);

  const createCell = (type) => {
    switch (type) {
      case "code":
        return { id: uuidv4(), type, source: "", label: "Code Cell" };
      case "variable":
        return { id: uuidv4(), type, metadata: { variables: [{ name: "x", type: "int", value: 0 }] }, label: "Variable Cell" };
      case "function":
        return { id: uuidv4(), type, metadata: { name: "my_func", params: [], body: "pass" }, label: "Function Cell" };
      case "loop":
        return { id: uuidv4(), type, metadata: { indexVar: "i", count: 5, body: "pass" }, label: "Loop Cell" };
      case "condition":
        return { id: uuidv4(), type, metadata: { condition: "True" }, label: "Condition Cell" };
      default:
        return { id: uuidv4(), type: "code", source: "", label: "Code Cell" };
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

  // 🔹 Reorder helpers
  const reorderCells = (from, to) => {
    setCells((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      // bump version so Monaco remounts cleanly
      copy.splice(to, 0, { ...moved, version: (moved.version || 0) + 1 });
      return copy;
    });
  };

  const moveCellUp = (idx) => idx > 0 && reorderCells(idx, idx - 1);
  const moveCellDown = (idx) => idx < cells.length - 1 && reorderCells(idx, idx + 1);

  const runOne = async (cell) => {
    const code = blockToPythonFromCell(cell);
    try {
      const res = await localApi.post("/run_cell/", { code }); // 🔹 use localApi
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
    try {
      await localApi.post("/reset_context/"); // 🔹 use localApi
    } catch { /* ignore */ }
    setOutputs({});
    setStepIdx(0);
  };

  const insertCell = (index, type) => {
    setCells((prev) => {
      const newCells = [...prev];
      newCells.splice(index, 0, createCell(type));
      return newCells;
    });
  };

  return (
    <div className="card" style={{ height: "95vh", display: "flex", flexDirection: "column" }}>
      {/* 🔹 Toolbar pinned */}
      <div
        className="card-header d-flex align-items-center gap-2"
        style={{
          flex: "0 0 auto",
          borderBottom: "1px solid var(--brand-outline)",
          background: "var(--brand-50a)",
        }}
      >
        <button className="btn-brand d-flex align-items-center gap-1" onClick={resetKernel}>
          <RotateCcw size={16} /> <span>Reset</span>
        </button>

        <button
          className="btn-brand-outline d-flex align-items-center gap-1"
          onClick={runStep}
          disabled={isRunning}
        >
          <StepForward size={16} />
          <span>Step ({Math.min(stepIdx + 1, cells.length)}/{cells.length || 0})</span>
        </button>

        <button
          className="btn-brand d-flex align-items-center gap-1"
          onClick={runAll}
          disabled={isRunning}
        >
          <Play size={16} /> <span>Run All</span>
        </button>

        <button className="btn-brand d-flex align-items-center gap-1" onClick={saveNotebook}>
          <Save size={16} /> <span>Save</span>
        </button>

        <select
          className="ds-input form-select"
          value={selectedVersion}
          onChange={handleVersionChange}
        >
          <option value="">-- Select version --</option>
          {versions.map((v) => (
            <option key={v} value={v}>
              {v} {v === activeVersion ? " (active)" : ""}
            </option>
          ))}
        </select>

        <button className="btn-brand-outline d-flex align-items-center gap-1" onClick={registerVersion}>
          <CheckSquare size={16} /> <span>Register</span>
        </button>
      </div>

      {/* 🔹 Scrollable notebook area */}
      <div
        className="card-body brand-scroll"
        style={{
          flex: "1 1 auto",
          overflowY: "auto",
          padding: 16,
          background: "var(--bs-body-bg)",  // ✅ auto light/dark
          color: "var(--bs-body-color)",
        }}
      >
        {/* Empty notebook message */}
        {cells.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <h3 className="ds-heading" style={{ marginBottom: 16 }}>
              Your notebook is empty
            </h3>
            <p style={{ marginBottom: 20 }}>Add your first cell:</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn-brand" onClick={() => setCells([createCell("code")])}>+ Code</button>
              <button className="btn-brand" onClick={() => setCells([createCell("variable")])}>+ Variable</button>
              <button className="btn-brand" onClick={() => setCells([createCell("function")])}>+ Function</button>
              <button className="btn-brand" onClick={() => setCells([createCell("loop")])}>+ Loop</button>
              <button className="btn-brand" onClick={() => setCells([createCell("condition")])}>+ Condition</button>
            </div>
          </div>
        )}

        {/* Notebook cells */}
        {cells.map((cell, idx) => {
          const isActive = idx === stepIdx;
          const out = outputs[cell.id];


          return (
            <div
              key={`${cell.id}-${cell.version || 0}`}
              className="ds-card"
              style={{
                border: `2px solid ${isActive ? "var(--brand)" : "var(--brand-outline)"}`,
                borderRadius: 12,
                padding: 10,
                marginBottom: 20,
                background: "var(--bs-body-bg)",   // ✅ auto dark/light
                color: "var(--bs-body-color)",
                transition: "all 0.2s ease",
              }}
            >
              {/* Header row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                {/* Cell type label on the left */}
                <input
                  type="text"
                  value={cell.label || `${cell.type.toUpperCase()} Cell`}
                  onChange={(e) => updateCell(cell.id, { label: e.target.value })}
                  style={{
                    border: "none",
                    background: "transparent",
                    fontWeight: 600,
                    fontSize: 13,
                    color: "var(--bs-body-color)",
                    outline: "none",
                    width: "150px",
                  }}
                />

                {/* Compact toolbar on the right */}
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className="btn-ghost"
                    style={{ padding: "2px 6px", borderRadius: 8 }}
                    onClick={() => moveCellUp(idx)}
                    title="Move Up"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ padding: "2px 6px", borderRadius: 8 }}
                    onClick={() => moveCellDown(idx)}
                    title="Move Down"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    className="btn-brand-outline"
                    style={{ padding: "2px 8px", borderRadius: 8 }}
                    onClick={() => runOne(cell)}
                    disabled={isRunning}
                    title="Run Cell"
                  >
                    <Play size={16} /> <span style={{ fontSize: 12 }}>Run</span>
                  </button>
                  {cell.type !== "code" && (
                    <button
                      className="btn-ghost"
                      style={{ padding: "2px 8px", borderRadius: 8 }}
                      onClick={() => setSelectedCell(cell)}
                      title="Edit Cell"
                    >
                      <Edit3 size={16} /> <span style={{ fontSize: 12 }}>Edit</span>
                    </button>
                  )}
                  <button
                    className="btn-danger-outline"
                    style={{ padding: "2px 6px", borderRadius: 8 }}
                    onClick={() => removeCell(cell.id)}
                    title="Delete Cell"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>





              {/* Cell body */}
              {cell.type === "code" ? (
                <NotebookCell
                  cell={cell}
                  onChange={(updated) => updateCell(cell.id, updated)}
                  output={out}
                />
              ) : (
                <>
                  <pre
                    style={{
                      background: "var(--brand-50a)",
                      padding: 8,
                      borderRadius: 6,
                      fontSize: 12,
                      marginBottom: 8,
                      whiteSpace: "pre-wrap",
                      color: "var(--bs-body-color)",  // ✅ readable in dark
                    }}
                  >
                    {blockToPythonFromCell(cell)}
                  </pre>
                  {out && (
                    <div style={{ marginTop: 6 }}>
                      {out.stderr ? (
                        <div className="cell-error" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <XCircle size={18} style={{ color: "var(--bs-danger-text)" }} />
                          {out.stderr}
                        </div>
                      ) : (
                        <CheckCircle2 size={18} style={{ color: "var(--brand-800)" }} />
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Per-cell Add Menu */}
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 8,
                  borderTop: "1px dashed var(--brand-outline)",
                  textAlign: "center",
                }}
              >
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  <button className="btn-ghost" onClick={() => insertCell(idx + 1, "code")}>+ Code</button>
                  <button className="btn-ghost" onClick={() => insertCell(idx + 1, "variable")}>+ Variable</button>
                  <button className="btn-ghost" onClick={() => insertCell(idx + 1, "function")}>+ Function</button>
                  <button className="btn-ghost" onClick={() => insertCell(idx + 1, "loop")}>+ Loop</button>
                  <button className="btn-ghost" onClick={() => insertCell(idx + 1, "condition")}>+ Condition</button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add cell menu at bottom */}
        {cells.length > 0 && (
          <div style={{ marginTop: 20, padding: 10, textAlign: "center" }}>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn-brand" onClick={() => setCells((prev) => [...prev, createCell("code")])}>+ Code</button>
              <button className="btn-brand" onClick={() => setCells((prev) => [...prev, createCell("variable")])}>+ Variable</button>
              <button className="btn-brand" onClick={() => setCells((prev) => [...prev, createCell("function")])}>+ Function</button>
              <button className="btn-brand" onClick={() => setCells((prev) => [...prev, createCell("loop")])}>+ Loop</button>
              <button className="btn-brand" onClick={() => setCells((prev) => [...prev, createCell("condition")])}>+ Condition</button>
            </div>
          </div>
        )}
      </div>

      {/* 🔹 Modal editor */}
      {selectedCell && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setSelectedCell(null)}
        >
          <div
            className="ds-card"
            style={{
              background: "var(--bs-body-bg)",
              color: "var(--bs-body-color)",
              padding: 20,
              borderRadius: 12,
              minWidth: 560,
              maxHeight: "80vh",
              overflowY: "auto",
            }}
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
