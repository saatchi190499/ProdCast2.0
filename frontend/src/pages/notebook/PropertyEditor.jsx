import { useState } from "react";
import Editor from "@monaco-editor/react";
import { TYPE_OPTIONS } from "./utils/helpers";
import api from "../../utils/axiosInstance";
import { usePetexTips } from "./context/PetexTipsContext";
import { Trash2, Plus } from "lucide-react";import { useTheme } from "../../context/ThemeContext";


export default function PropertyEditor({ node, onSave }) {
  const [data, setData] = useState(node.metadata || {});
  const { addOrUpdateVar, deleteVar, refreshTips, tips } = usePetexTips();
  const { mode } = useTheme();


  const update = (k, v) => setData((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (node.type === "variable") {
      const oldVars = node.metadata?.variables || [];
      const newVars = data.variables || [];

      // Deleted vars
      const deleted = oldVars.filter(
        (ov) => !newVars.some((nv) => nv.name === ov.name)
      );
      for (const v of deleted) {
        await api.post("/delete_var/", { name: v.name });
        deleteVar(v.name);
      }

      // Added/updated vars
      for (const v of newVars) {
        await api.post("/set_var/", v);
        addOrUpdateVar(v.name, {
          type: v.type,
          preview: String(v.value),
        });
      }

      await refreshTips();
    }

    onSave(data);
  };

  // 🔹 Variable Cell Editor
  if (node.type === "variable") {
    const vars = data.variables || [];

    const setVar = (idx, key, val) => {
      const newVars = vars.map((v, i) =>
        i === idx ? { ...v, [key]: val } : v
      );
      update("variables", newVars);
    };

    const addVar = () => {
      update("variables", [
        ...vars,
        { name: `var${vars.length + 1}`, type: "any", value: "" },
      ]);
    };

    const removeVar = (idx) => {
      update("variables", vars.filter((_, i) => i !== idx));
    };

    return (
      <div className="ds-card" style={{ padding: 16 }}>
        <h4 className="ds-heading">Variables</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {vars.map((v, idx) => {
            let valueInput = null;

            if (v.type === "var") {
              const varNames = Object.keys((tips && tips.__variables__) || {}).filter(
                (n) => n !== v.name
              );
              valueInput = (
                <select
                  className="ds-input form-select"
                  value={v.value}
                  onChange={(e) => setVar(idx, "value", e.target.value)}
                >
                  <option value="">Select variable</option>
                  {varNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              );
            } else if (v.type === "func") {
              const userFuncs = Object.keys((tips && tips.__functions__) || {});
              const petexFuncs = Object.keys(tips || {}).filter(
                (n) => tips[n]?.kind === "function"
              );
              const funcNames = Array.from(new Set([...userFuncs, ...petexFuncs]));
              valueInput = (
                <select
                  className="ds-input form-select"
                  value={v.value}
                  onChange={(e) => setVar(idx, "value", e.target.value)}
                >
                  <option value="">Select function</option>
                  {funcNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              );
            } else {
              valueInput = (
                <input
                  className="ds-input"
                  value={v.value}
                  onChange={(e) => setVar(idx, "value", e.target.value)}
                  placeholder="Value"
                />
              );
            }

            return (
              <div
                key={idx}
                style={{ display: "flex", gap: 6, alignItems: "center" }}
              >
                <input
                  className="ds-input"
                  value={v.name}
                  onChange={(e) => setVar(idx, "name", e.target.value)}
                  placeholder="Name"
                />
                <select
                  className="ds-input form-select"
                  value={v.type}
                  onChange={(e) => setVar(idx, "type", e.target.value)}
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                {valueInput}
                <button
                  className="btn-danger-outline"
                  onClick={() => removeVar(idx)}
                  title="Delete variable"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button className="btn-ghost" onClick={addVar}>
            <Plus size={16} /> Add variable
          </button>
          <button className="btn-brand" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    );
  }

  // 🔹 Function Cell Editor
  if (node.type === "function") {
    const params = data.params || [];

    const setParam = (idx, key, val) => {
      const np = params.map((p, i) => (i === idx ? { ...p, [key]: val } : p));
      update("params", np);
    };

    const addParam = () => {
      update("params", [
        ...params,
        { name: `param${params.length + 1}`, type: "any", default: "" },
      ]);
    };

    const removeParam = (idx) => {
      update("params", params.filter((_, i) => i !== idx));
    };

    return (
      <div className="ds-card" style={{ padding: 16 }}>
        <label className="ds-heading">Function name</label>
        <input
          className="ds-input"
          value={data.name || ""}
          onChange={(e) => update("name", e.target.value)}
        />

        <h4 className="ds-heading" style={{ marginTop: 12 }}>Parameters</h4>
        {params.map((p, idx) => (
          <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
            <input
              className="ds-input"
              value={p.name}
              onChange={(e) => setParam(idx, "name", e.target.value)}
              placeholder="Name"
            />
            <select
              className="ds-input form-select"
              value={p.type}
              onChange={(e) => setParam(idx, "type", e.target.value)}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <input
              className="ds-input"
              value={p.default}
              onChange={(e) => setParam(idx, "default", e.target.value)}
              placeholder="Default"
            />
            <button
              className="btn-danger-outline"
              onClick={() => removeParam(idx)}
              title="Remove param"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button className="btn-ghost" onClick={addParam}>
          <Plus size={16} /> Add parameter
        </button>

        <div style={{ marginTop: 12 }}>
          <label className="ds-heading">Body</label>
          <Editor
            height="200px"
            defaultLanguage="python"
            value={data.body || ""}
            onChange={(val) => update("body", val)}
            theme={mode === "dark" ? "vs-dark" : "light"}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <button className="btn-brand" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    );
  }

  // 🔹 Loop Editor
  if (node.type === "loop") {
    return (
      <div className="ds-card" style={{ padding: 16 }}>
        <label className="ds-heading">Index var</label>
        <input
          className="ds-input"
          value={data.indexVar || "i"}
          onChange={(e) => update("indexVar", e.target.value)}
        />
        <label className="ds-heading">Count</label>
        <input
          className="ds-input"
          type="number"
          value={data.count || 5}
          onChange={(e) => update("count", Number(e.target.value))}
        />
        <div style={{ marginTop: 12 }}>
          <label className="ds-heading">Body</label>
          <Editor
            height="200px"
            defaultLanguage="python"
            value={data.body || ""}
            onChange={(val) => update("body", val)}
            theme={mode === "dark" ? "vs-dark" : "light"}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn-brand" onClick={handleSave}>Save</button>
        </div>
      </div>
    );
  }

  // 🔹 Condition Editor
  if (node.type === "condition") {
    return (
      <div className="ds-card" style={{ padding: 16 }}>
        <label className="ds-heading">Condition</label>
        <input
          className="ds-input"
          value={data.condition || "True"}
          onChange={(e) => update("condition", e.target.value)}
        />
        <div style={{ marginTop: 12 }}>
          <button className="btn-brand" onClick={handleSave}>Save</button>
        </div>
      </div>
    );
  }

  return null;
}
