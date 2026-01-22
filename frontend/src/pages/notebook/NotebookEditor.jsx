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
  const [showInternalModal, setShowInternalModal] = useState(false);
  const [internalSection, setInternalSection] = useState("components");
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalComponents, setInternalComponents] = useState([]);
  const [objectTypes, setObjectTypes] = useState([]);
  const [instancesByType, setInstancesByType] = useState({});
  const [propertyOptions, setPropertyOptions] = useState({});
  const [selectedComponents, setSelectedComponents] = useState([]);
  const [selectedObjectType, setSelectedObjectType] = useState("");
  const [selectedInstances, setSelectedInstances] = useState([]);
  const [selectedProperties, setSelectedProperties] = useState([]);
  const [internalStart, setInternalStart] = useState("");
  const [internalEnd, setInternalEnd] = useState("");
  const [showOutputsModal, setShowOutputsModal] = useState(false);
  const [outputComponentId, setOutputComponentId] = useState("");
  const [outputObjectType, setOutputObjectType] = useState("");
  const [outputInstance, setOutputInstance] = useState("");
  const [outputProperty, setOutputProperty] = useState("");
  const [outputValueExpr, setOutputValueExpr] = useState("value");
  const [outputDescription, setOutputDescription] = useState("");
  const [outputDateTime, setOutputDateTime] = useState("");
  const [outputSaveTarget, setOutputSaveTarget] = useState("local");
  const [outputMode, setOutputMode] = useState("append");
  const [instanceFilter, setInstanceFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");

  useEffect(() => {
    if (!id) return;
    api.get(`/components/workflows/${id}/`)
      .then(res => setCells(res.data.cells || []))
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
    if (!showInternalModal) return;
    loadInternalMeta();
  }, [showInternalModal]);

  useEffect(() => {
    if (!showOutputsModal) return;
    loadInternalMeta();
  }, [showOutputsModal]);

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

    // 🔹 mark cell as "loading"
    setOutputs((prev) => ({
      ...prev,
      [cell.id]: { loading: true, code },
    }));

    try {
      const res = await localApi.post("/run_cell/", { code, workflow_component_id: Number(id) });
      const { stdout, stderr, variables } = res.data;

      // 🔹 finished, update with result
      setOutputs((prev) => ({
        ...prev,
        [cell.id]: { stdout, stderr, code, loading: false },
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
        [cell.id]: { stdout: "", stderr: String(err), code, loading: false },
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
      await localApi.post("/reset_context/"); // 🔹 use localApi
    } catch { /* ignore */ }
    setOutputs({});
    setStepIdx(0);
  };

  const openInternalModal = (section) => {
    setInternalSection(section);
    setShowInternalModal(true);
  };

  const toggleSelectedComponent = (idValue) => {
    setSelectedComponents((prev) => (
      prev.includes(idValue) ? prev.filter((id) => id !== idValue) : [...prev, idValue]
    ));
  };

  const toggleSelectedProperty = (name) => {
    setSelectedProperties((prev) => (
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    ));
  };

  const toggleSelectedInstance = (name) => {
    setSelectedInstances((prev) => (
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    ));
  };

  const buildInternalQueryCode = () => {
    const componentList = selectedComponents.length
      ? `[${selectedComponents.join(", ")}]`
      : "[]";
    const typeLiteral = selectedObjectType ? JSON.stringify(selectedObjectType) : "None";
    const instancesLiteral = selectedInstances.length
      ? `[${selectedInstances.map((n) => JSON.stringify(n)).join(", ")}]`
      : "[]";
    const propertiesLiteral = selectedProperties.length
      ? `[${selectedProperties.map((n) => JSON.stringify(n)).join(", ")}]`
      : "[]";

    return [
      "# Internal records selection",
      `components = ${componentList}`,
      `object_type = ${typeLiteral}`,
      `instances = ${instancesLiteral}`,
      `properties = ${propertiesLiteral}`,
      "records = internal.get_records(",
      "    components=components if components else None,",
      "    object_type=object_type if object_type else None,",
      "    instances=instances if instances else None,",
      "    properties=properties if properties else None,",
      ")",
    ].join("\n");
  };



  const insertInternalQueryCell = () => {
    const code = buildInternalQueryCode();
    setCells((prev) => [
      ...prev,
      { id: uuidv4(), type: "code", source: code, label: "Internal Query" },
    ]);
    setShowInternalModal(false);
  };

  const buildInternalHistoryCode = () => {
    const componentList = selectedComponents.length
      ? `[${selectedComponents.join(", ")}]`
      : "[]";
    const typeLiteral = selectedObjectType ? JSON.stringify(selectedObjectType) : "None";
    const instancesLiteral = selectedInstances.length
      ? `[${selectedInstances.map((n) => JSON.stringify(n)).join(", ")}]`
      : "[]";
    const startLiteral = internalStart ? JSON.stringify(internalStart) : "None";
    const endLiteral = internalEnd ? JSON.stringify(internalEnd) : "None";

    return [
      "# Internal history selection",
      `components = ${componentList}`,
      `object_type = ${typeLiteral}`,
      `instances = ${instancesLiteral}`,
      `properties = ${propertiesLiteral}`,
      `start = ${startLiteral}`,
      `end = ${endLiteral}`,
      "history = internal.get_history(",
      "    components=components if components else None,",
      "    object_type=object_type if object_type else None,",
      "    instances=instances if instances else None,",
      "    properties=properties if properties else None,",
      "    start=start,",
      "    end=end,",
      ")",
    ].join("\n");
  };

  const insertInternalHistoryCell = () => {
    const code = buildInternalHistoryCode();
    setCells((prev) => [

      ...prev,
      { id: uuidv4(), type: "code", source: code, label: "Internal History" },
    ]);
    setShowInternalModal(false);
  };

  const buildOutputRecordCode = () => {
    const componentLiteral = outputComponentId ? Number(outputComponentId) : "None";
    const typeLiteral = outputObjectType ? JSON.stringify(outputObjectType) : "None";
    const instanceLiteral = outputInstance ? JSON.stringify(outputInstance) : "None";
    const propertyLiteral = outputProperty ? JSON.stringify(outputProperty) : "None";
    const descLiteral = outputDescription ? JSON.stringify(outputDescription) : "None";
    const dateLiteral = outputDateTime ? JSON.stringify(outputDateTime) : "None";
    const valueExpr = outputValueExpr || "None";
    const saveTo = outputSaveTarget === "db" ? "\"db\"" : "None";

    return [
      "# Workflow output save",
      `component_id = ${componentLiteral}`,
      `output_value = ${valueExpr}`,
      "record = {",
      "    \"component\": component_id,",
      `    \"object_type\": ${typeLiteral},`,
      `    \"object_instance\": ${instanceLiteral},`,
      `    \"object_type_property\": ${propertyLiteral},`,
      "    \"value\": output_value,",
      `    \"date_time\": ${dateLiteral},`,
      `    \"description\": ${descLiteral},`,
      "}",
      "records = [record]",
      `workflow_save_output(records, mode="${outputMode}", save_to=${saveTo}, component_id=component_id)`,
    ].join("\n");
  };

  const insertOutputCell = () => {
    const code = buildOutputRecordCode();
    setCells((prev) => [
      ...prev,
      { id: uuidv4(), type: "code", source: code, label: "Workflow Output" },
    ]);
    setShowOutputsModal(false);
  };

  const handleObjectTypeChange = (value) => {
    setSelectedObjectType(value);
    setSelectedInstances([]);
    setSelectedProperties([]);
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
          onClick={() => openInternalModal("components")}
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
              {v} {v === activeVersion ? " (active)" : ""}
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

      {showInternalModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowInternalModal(false)}
        >
          <div
            className="ds-card"
            style={{
              background: "var(--bs-body-bg)",
              color: "var(--bs-body-color)",
              padding: 20,
              borderRadius: 12,
              minWidth: 640,
              maxWidth: "80vw",
              maxHeight: "80vh",
              overflowY: "auto",
              display: "grid",
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h4 className="ds-heading" style={{ margin: 0 }}>Internal Selection</h4>
              <button className="btn-ghost" onClick={() => setShowInternalModal(false)}>
                <X size={16} />
              </button>
            </div>

            {internalLoading && <div>Loading...</div>}

            {!internalLoading && (
              <>
                <div data-ui="internal-columns" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, alignItems: "start" }}>
                <div
                  style={{
                    border: internalSection === "components" ? "2px solid var(--brand)" : "1px solid var(--brand-outline)",
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Components</div>
                  {internalComponents.length === 0 && <div>No Internal components found.</div>}
                  {internalComponents.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
                      {internalComponents.map((comp) => (
                        <label key={comp.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={selectedComponents.includes(comp.id)}
                            onChange={() => toggleSelectedComponent(comp.id)}
                          />
                          <span>{comp.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    border: internalSection === "object_type" ? "2px solid var(--brand)" : "1px solid var(--brand-outline)",
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Object Type</div>
                  <select
                    className="form-select"
                    value={selectedObjectType}
                    onChange={(e) => handleObjectTypeChange(e.target.value)}
                  >
                    <option value="">Select object type...</option>
                    {objectTypes.map((t) => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div
                  style={{
                    border: internalSection === "instances" ? "2px solid var(--brand)" : "1px solid var(--brand-outline)",
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Instance Group</div>
                  <input
                    className="form-control"
                    value={instanceFilter}
                    onChange={(e) => setInstanceFilter(e.target.value)}
                    placeholder="Filter instances..."
                    style={{ marginBottom: 8 }}
                  />
                  {!selectedObjectType && <div>Select an object type to see instances.</div>}
                  {selectedObjectType && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
                      {(instancesByType[selectedObjectType] || []).filter((inst) => !instanceFilter || String(inst.name).toLowerCase().includes(instanceFilter.toLowerCase())).map((inst) => (
                        <label key={inst.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={selectedInstances.includes(inst.name)}
                            onChange={() => toggleSelectedInstance(inst.name)}
                          />
                          <span>{inst.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    border: internalSection === "properties" ? "2px solid var(--brand)" : "1px solid var(--brand-outline)",
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Object Type Property</div>
                  <input
                    className="form-control"
                    value={propertyFilter}
                    onChange={(e) => setPropertyFilter(e.target.value)}
                    placeholder="Filter properties..."
                    style={{ marginBottom: 8 }}
                  />
                  {!selectedObjectType && <div>Select an object type to see properties.</div>}
                  {selectedObjectType && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 6 }}>
                      {(propertyOptions[selectedObjectType] || []).filter((prop) => !propertyFilter || String(prop.name).toLowerCase().includes(propertyFilter.toLowerCase())).map((prop) => (
                        <label key={prop.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={selectedProperties.includes(prop.name)}
                            onChange={() => toggleSelectedProperty(prop.name)}
                          />
                          <span>{prop.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                </div>

                <div
                  style={{
                    border: "1px solid var(--brand-outline)",
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Date Range (History)</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      type="datetime-local"
                      className="form-control"
                      value={internalStart}
                      onChange={(e) => setInternalStart(e.target.value)}
                    />
                    <input
                      type="datetime-local"
                      className="form-control"
                      value={internalEnd}
                      onChange={(e) => setInternalEnd(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      setSelectedComponents([]);
                      setSelectedObjectType("");
                      setSelectedInstances([]);
                    }}
                  >
                    Clear
                  </button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-brand-outline" onClick={() => setShowInternalModal(false)}>
                      Close
                    </button>
                    <button className="btn-brand" onClick={insertInternalQueryCell}>
                      Insert Code Cell
                    </button>
                    <button className="btn-brand" onClick={insertInternalHistoryCell}>
                      Insert History Cell
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showOutputsModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowOutputsModal(false)}
        >
          <div
            className="ds-card"
            style={{
              background: "var(--bs-body-bg)",
              color: "var(--bs-body-color)",
              padding: 20,
              borderRadius: 12,
              minWidth: 640,
              maxWidth: "80vw",
              maxHeight: "80vh",
              overflowY: "auto",
              display: "grid",
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h4 className="ds-heading" style={{ margin: 0 }}>Workflow Outputs</h4>
              <button className="btn-ghost" onClick={() => setShowOutputsModal(false)}>
                <X size={16} />
              </button>
            </div>

            {internalLoading && <div>Loading...</div>}

            {!internalLoading && (
              <>
                <div data-ui="internal-columns" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, alignItems: "start" }}>
                <div>
                  <label style={{ fontWeight: 600 }}>Component</label>
                  <select
                    className="form-select"
                    value={outputComponentId}
                    onChange={(e) => setOutputComponentId(e.target.value)}
                  >
                    <option value="">Select component...</option>
                    {internalComponents.map((comp) => (
                      <option key={comp.id} value={comp.id}>{comp.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontWeight: 600 }}>Object Type</label>
                  <select
                    className="form-select"
                    value={outputObjectType}
                    onChange={(e) => {
                      setOutputObjectType(e.target.value);
                      setOutputInstance("");
                      setOutputProperty("");
                    }}
                  >
                    <option value="">Select object type...</option>
                    {objectTypes.map((t) => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontWeight: 600 }}>Instance</label>
                  <select
                    className="form-select"
                    value={outputInstance}
                    onChange={(e) => setOutputInstance(e.target.value)}
                    disabled={!outputObjectType}
                  >
                    <option value="">Select instance...</option>
                    {(instancesByType[outputObjectType] || []).map((inst) => (
                      <option key={inst.id} value={inst.name}>{inst.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontWeight: 600 }}>Object Type Property</label>
                  <select
                    className="form-select"
                    value={outputProperty}
                    onChange={(e) => setOutputProperty(e.target.value)}
                    disabled={!outputObjectType}
                  >
                    <option value="">Select property...</option>
                    {(propertyOptions[outputObjectType] || []).map((prop) => (
                      <option key={prop.id} value={prop.name}>{prop.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontWeight: 600 }}>Value Expression</label>
                  <input
                    className="form-control"
                    value={outputValueExpr}
                    onChange={(e) => setOutputValueExpr(e.target.value)}
                    placeholder="value"
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 600 }}>Description (optional)</label>
                  <input
                    className="form-control"
                    value={outputDescription}
                    onChange={(e) => setOutputDescription(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 600 }}>Date/Time (optional)</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={outputDateTime}
                    onChange={(e) => setOutputDateTime(e.target.value)}
                  />
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <label style={{ fontWeight: 600 }}>Save Target</label>
                    <select
                      className="form-select"
                      value={outputSaveTarget}
                      onChange={(e) => setOutputSaveTarget(e.target.value)}
                    >
                      <option value="local">Local JSON</option>
                      <option value="db">Database</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontWeight: 600 }}>Mode</label>
                    <select
                      className="form-select"
                      value={outputMode}
                      onChange={(e) => setOutputMode(e.target.value)}
                    >
                      <option value="append">Append</option>
                      <option value="replace">Replace</option>
                    </select>
                  </div>
                </div>

                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button className="btn-brand-outline" onClick={() => setShowOutputsModal(false)}>
                    Close
                  </button>
                  <button className="btn-brand" onClick={insertOutputCell}>
                    Insert Output Cell
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}


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
      {/* Expanded overlay removed by request */}
    </div>
  );


}
