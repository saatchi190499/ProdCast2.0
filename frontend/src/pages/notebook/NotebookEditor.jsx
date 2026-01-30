import React, { useState, useEffect, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import NotebookCell from "./NotebookCell";
import PropertyEditor from "./PropertyEditor";
import api, { localApi } from "../../utils/axiosInstance";
import { blockToPythonFromCell } from "./utils/blockToPythonFromCell";
import { usePetexTips } from "./context/PetexTipsContext";
import { useMonaco } from "@monaco-editor/react";
import { useParams } from "react-router-dom";
import { registerPythonProviders } from "./utils/registerPythonProviders";
import WorkflowTablesConfigModal from "./WorkflowTablesConfigModal";
import { buildWorkflowTablesBootstrap } from "./utils/buildWorkflowTablesBootstrap";
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
  StepForward,
  X, Plus, Code2, Variable, FunctionSquare, Repeat, GitCompare,
  ChevronDown, ChevronRight
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
  const [autoCollapsePrevious, setAutoCollapsePrevious] = useState(true);
  const [showInputsModal, setShowInputsModal] = useState(false);
  const [inputsConfig, setInputsConfig] = useState({ tabs: [] });
  const [outputsConfig, setOutputsConfig] = useState({ mode: "append", saveTarget: "local", tabs: [] });
  const workflowTableHints = useMemo(() => {
    const ident = (name) => {
      const s = String(name || "").replace(/[^a-zA-Z0-9_]/g, "");
      if (!s) return "_Table";
      return /^\d/.test(s) ? `_${s}` : s;
    };

    const build = (tabs, suffix) =>
      (tabs || []).filter(Boolean).map((tab) => {
        const base = ident(tab.type);
        return {
          name: `${base}${suffix}`,
          columns: (tab.columns || []).map((c) => c.label).filter(Boolean),
          rows: (tab.instances || []).filter(Boolean),
          variant: suffix.includes('Outputs') ? 'outputs' : 'inputs',
        };
      });

    return [
      ...build(inputsConfig?.tabs, 'InputsTable'),
      ...build(outputsConfig?.tabs, 'OutputsTable'),
      { name: 'inputs', variant: 'config' },
      { name: 'outputs', variant: 'config' },
    ];
  }, [inputsConfig, outputsConfig]);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalComponents, setInternalComponents] = useState([]);
  const [objectTypes, setObjectTypes] = useState([]);
  const [instancesByType, setInstancesByType] = useState({});
  const [propertyOptions, setPropertyOptions] = useState({});
  const [showOutputsModal, setShowOutputsModal] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get(`/components/workflows/${id}/`)
      .then(res => {
        setCells(res.data.cells || []);
        setInputsConfig(res.data.inputs_config || { tabs: [] });
        setOutputsConfig(res.data.outputs_config || { mode: "append", saveTarget: "local", tabs: [] });
      })
      .catch(err => console.error("Failed to load workflow", err));
    loadVersions();
  }, [id]);

  const loadInternalMeta = async () => {
    try {
      setInternalLoading(true);
      const [compRes, metaRes] = await Promise.all([
        api.get("/data-sources/Internal/components/"),
        api.get("/object-metadata/"),
      ]);
      setInternalComponents(compRes.data || []);
      setObjectTypes(metaRes.data?.types || []);
      setInstancesByType(metaRes.data?.instances || {});
      setPropertyOptions(metaRes.data?.properties || {});
    } catch (err) {
      console.error("Failed to load internal metadata", err);
    } finally {
      setInternalLoading(false);
    }
  };

  useEffect(() => {
    if (!showInputsModal) return;
    loadInternalMeta();
  }, [showInputsModal]);

  useEffect(() => {
    if (!showOutputsModal) return;
    loadInternalMeta();
  }, [showOutputsModal]);

  const formatVersionLabel = (ts) => {
    if (!ts) return "";
    try {
      const s = String(ts);
      // backend uses YYYY-MM-DDTHH-MM-SS
      const parts = s.split("T");
      if (parts.length !== 2) return s;
      const date = parts[0];
      const time = parts[1].replace(/-(?=\d{2}$)/, ":").replace(/-(?=\d{2}:\d{2}$)/, ":");
      const d = new Date(`${date}T${time}`);
      if (Number.isNaN(d.getTime())) return s;
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(d);
    } catch {
      return String(ts);
    }
  };
  const loadVersions = async () => {
    try {
      const res = await api.get(`/components/workflows/${id}/versions/`);
      const payload = res.data || {};
      setVersions(payload.versions || []);
      const active = payload.active || "";
      setActiveVersion(active);
      setSelectedVersion((prev) => (prev ? prev : active));
      return payload;
    } catch (err) {
      console.error("Failed to load versions", err);
      return null;
    }
  };



  const saveNotebook = async () => {
    try {
      await api.patch(`/components/workflows/${id}/`, { cells, inputs_config: inputsConfig, outputs_config: outputsConfig });
      const payload = await loadVersions();
      if (payload?.active) setSelectedVersion(payload.active);
      alert("Notebook saved successfully!");
    } catch (err) {
      console.error("Failed to save workflow", err);
      alert("âŒ Failed to save notebook");
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
      alert("Version registered!");
      const payload = await loadVersions();
      if (payload?.active) setSelectedVersion(payload.active);
    } catch (err) {
      console.error("Failed to register version", err);
      alert("âŒ Failed to register version");
    }
  };


  // Centralized provider registration
  useEffect(() => {
    if (monaco && tips) {
      registerPythonProviders(monaco, tips, workflowTableHints);
    }
  }, [monaco, tips, workflowTableHints]);

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

    // if variable cell â†’ delete its vars from backend
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

  // Reorder helpers
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
    const userCode = blockToPythonFromCell(cell);
    const bootstrap = buildWorkflowTablesBootstrap(inputsConfig, outputsConfig);
    const execCode = bootstrap ? bootstrap + "\n\n" + userCode : userCode;

    // mark cell as "loading"
    setOutputs((prev) => ({
      ...prev,
      [cell.id]: { loading: true, code: userCode },
    }));

    try {
      const res = await localApi.post("/run_cell/", { code: execCode, workflow_component_id: Number(id) });
      const { stdout, stderr, variables } = res.data;

      // finished, update with result
      setOutputs((prev) => ({
        ...prev,
        [cell.id]: { stdout, stderr, code: userCode, loading: false },
      }));

      // update context vars instantly
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
        [cell.id]: { stdout: "", stderr: String(err), code: userCode, loading: false },
      }));
    }
  };

  // When a cell's editor gains focus, optionally collapse previous cell
  const handleCellFocus = (id) => {
    if (!autoCollapsePrevious) return;
    setCells((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx < 0) return prev;
      const copy = [...prev];
      copy[idx] = { ...copy[idx], collapsed: false };
      if (idx > 0) {
        copy[idx - 1] = { ...copy[idx - 1], collapsed: true };
      }
      return copy;
    });
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
      await localApi.post("/reset_context/"); // use localApi
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
      {/* Toolbar pinned */}
      <div
        className="card-header d-flex align-items-center gap-2"
        style={{
          flex: "0 0 auto",
          borderBottom: "1px solid var(--brand-outline)",
          background: "var(--brand-50a)",
        }}
      >
        <button className="btn-brand toolbar-item gap-1" onClick={resetKernel}>
          <RotateCcw size={16} /> <span>Reset</span>
        </button>

        <button
          className="btn-brand-outline toolbar-item gap-1"
          onClick={runStep}
          disabled={isRunning}
        >
          <StepForward size={16} />
          <span>Step ({Math.min(stepIdx + 1, cells.length)}/{cells.length || 0})</span>
        </button>

        <button
          className="btn-brand toolbar-item gap-1"
          onClick={runAll}
          disabled={isRunning}
        >
          <Play size={16} /> <span>Run All</span>
        </button>

        <button className="btn-brand toolbar-item gap-1" onClick={saveNotebook}>
          <Save size={16} /> <span>Save</span>
        </button>

        <button
          className="btn-brand-outline toolbar-item gap-1"
          onClick={() => setShowInputsModal(true)}
        >
          <Code2 size={16} /> <span>Inputs</span>
        </button>

        <button
          className="btn-brand-outline toolbar-item gap-1"
          onClick={() => setShowOutputsModal(true)}
        >
          <Save size={16} /> <span>Outputs</span>
        </button>

        <button
          className="btn-ghost toolbar-item gap-1"
          onClick={() => setAutoCollapsePrevious((v) => !v)}
          title="Auto-collapse previous cell when focusing next"
        >
          <CheckSquare size={16} style={{ opacity: autoCollapsePrevious ? 1 : 0.35 }} />
          <span>Auto-collapse prev: {autoCollapsePrevious ? "On" : "Off"}</span>
        </button>

        <select
          className="form-select toolbar-item"
          value={selectedVersion}
          onChange={handleVersionChange}
        >
          <option value="">-- Select version --</option>
          {versions.map((v) => (
            <option key={v} value={v}>
              {formatVersionLabel(v)}{v === activeVersion ? " (active)" : ""}
            </option>
          ))}
        </select>

        <button className="btn-brand-outline toolbar-item gap-1" onClick={registerVersion}>
          <CheckSquare size={16} /> <span>Register</span>
        </button>

        <button
          className="btn-danger-outline toolbar-item gap-1"
          onClick={() => window.history.back()} // or navigate("/")
        >
          <X size={16} /> <span>Close</span>
        </button>
      </div>



      {/* Scrollable notebook area */}
      <div
        className="card-body brand-scroll"
        style={{
          flex: "1 1 auto",
          overflowY: "auto",
          padding: 16,
          background: "var(--bs-body-bg)",  // auto light/dark
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
              <button className="btn-brand d-flex align-items-center gap-1"
                onClick={() => setCells([createCell("code")])}>
                <Code2 size={16} /> <span>Code</span>
              </button>

              <button className="btn-brand d-flex align-items-center gap-1"
                onClick={() => setCells([createCell("variable")])}>
                <Variable size={16} /> <span>Variable</span>
              </button>

              <button className="btn-brand d-flex align-items-center gap-1"
                onClick={() => setCells([createCell("function")])}>
                <FunctionSquare size={16} /> <span>Function</span>
              </button>

              <button className="btn-brand d-flex align-items-center gap-1"
                onClick={() => setCells([createCell("loop")])}>
                <Repeat size={16} /> <span>Loop</span>
              </button>

              <button className="btn-brand d-flex align-items-center gap-1"
                onClick={() => setCells([createCell("condition")])}>
                <GitCompare size={16} /> <span>Condition</span>
              </button>
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
                background: "var(--bs-body-bg)",   // auto dark/light
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
                  value={cell.label ?? ""}
                  placeholder={`${cell.type.toUpperCase()} Cell`}
                  onChange={(e) => updateCell(cell.id, { label: e.target.value })}
                  style={{
                    border: "none",
                    background: "transparent",
                    fontWeight: 600,
                    fontSize: 13,
                    color: "var(--bs-body-color)",
                    outline: "none",
                    width: "50%",
                  }}
                />

                {/* Compact toolbar on the right */}
                <div style={{ display: "flex", gap: 4 }}>
                  {/* Collapse/Expand inline toggle */}
                  <button
                    className="btn-ghost"
                    style={{ padding: "2px 6px", borderRadius: 8 }}
                    onClick={() => updateCell(cell.id, { collapsed: !cell.collapsed })}
                    title={cell.collapsed ? "Expand" : "Collapse"}
                  >
                    {cell.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </button>
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
              {!cell.collapsed && (cell.type === "code" ? (
                <NotebookCell
                  cell={cell}
                  onChange={(updated) => updateCell(cell.id, updated)}
                  onFocus={() => handleCellFocus(cell.id)}
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
                      color: "var(--bs-body-color)",  // readable in dark
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
              ))}

              {/* Per-cell Add Menu */}
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 8,
                  borderTop: "1px dashed var(--brand-outline)",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    className="btn-ghost d-flex align-items-center gap-1"
                    onClick={() => insertCell(idx + 1, "code")}
                  >
                    <Code2 size={16} /> <span>Code</span>
                  </button>

                  <button
                    className="btn-ghost d-flex align-items-center gap-1"
                    onClick={() => insertCell(idx + 1, "variable")}
                  >
                    <Variable size={16} /> <span>Variable</span>
                  </button>

                  <button
                    className="btn-ghost d-flex align-items-center gap-1"
                    onClick={() => insertCell(idx + 1, "function")}
                  >
                    <FunctionSquare size={16} /> <span>Function</span>
                  </button>

                  <button
                    className="btn-ghost d-flex align-items-center gap-1"
                    onClick={() => insertCell(idx + 1, "loop")}
                  >
                    <Repeat size={16} /> <span>Loop</span>
                  </button>

                  <button
                    className="btn-ghost d-flex align-items-center gap-1"
                    onClick={() => insertCell(idx + 1, "condition")}
                  >
                    <GitCompare size={16} /> <span>Condition</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add cell menu at bottom */}
        {cells.length > 0 && (
          <div style={{ marginTop: 20, padding: 10, textAlign: "center" }}>
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                className="btn-brand d-flex align-items-center gap-1"
                onClick={() => setCells((prev) => [...prev, createCell("code")])}
              >
                <Code2 size={16} /> <span>Code</span>
              </button>

              <button
                className="btn-brand d-flex align-items-center gap-1"
                onClick={() => setCells((prev) => [...prev, createCell("variable")])}
              >
                <Variable size={16} /> <span>Variable</span>
              </button>

              <button
                className="btn-brand d-flex align-items-center gap-1"
                onClick={() => setCells((prev) => [...prev, createCell("function")])}
              >
                <FunctionSquare size={16} /> <span>Function</span>
              </button>

              <button
                className="btn-brand d-flex align-items-center gap-1"
                onClick={() => setCells((prev) => [...prev, createCell("loop")])}
              >
                <Repeat size={16} /> <span>Loop</span>
              </button>

              <button
                className="btn-brand d-flex align-items-center gap-1"
                onClick={() => setCells((prev) => [...prev, createCell("condition")])}
              >
                <GitCompare size={16} /> <span>Condition</span>
              </button>
            </div>
          </div>
        )}
      </div>

            <WorkflowTablesConfigModal
        open={showInputsModal}
        title="Inputs"
        variant="inputs"
        config={inputsConfig}
        setConfig={setInputsConfig}
        onClose={() => setShowInputsModal(false)}
        internalComponents={internalComponents}
        objectTypes={objectTypes}
        instancesByType={instancesByType}
        propertyOptions={propertyOptions}
      />

      <WorkflowTablesConfigModal
        open={showOutputsModal}
        title="Outputs"
        variant="outputs"
        config={outputsConfig}
        setConfig={setOutputsConfig}
        onClose={() => setShowOutputsModal(false)}
        internalComponents={internalComponents}
        objectTypes={objectTypes}
        instancesByType={instancesByType}
        propertyOptions={propertyOptions}
      />

      {/* Modal editor */}
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
      {/* Expanded overlay removed by request */}
    </div>
  );


}




