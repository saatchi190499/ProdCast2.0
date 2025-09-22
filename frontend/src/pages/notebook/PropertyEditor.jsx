import { useState } from "react";
import Editor  from "@monaco-editor/react";
import { TYPE_OPTIONS } from "./utils/helpers";
import api from "../../utils/axiosInstance";
import { usePetexTips } from "./context/PetexTipsContext";

export default function PropertyEditor({ node, onSave }) {
  const [data, setData] = useState(node.metadata || {});
  const { addOrUpdateVar, deleteVar, refreshTips, tips } = usePetexTips();

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

      // 🔹 Force refresh after save
      await refreshTips();
    }

    onSave(data);
  };

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
      <div>
        <h4>Variables</h4>
        {vars.map((v, idx) => {
          let valueInput = null;
          if (v.type === "var") {
            // Show dropdown of variable names (exclude self)
            const varNames = Object.keys((tips && tips.__variables__) || {}).filter(n => n !== v.name);
            valueInput = (
              <select value={v.value} onChange={e => setVar(idx, "value", e.target.value)}>
                <option value="">Select variable</option>
                {varNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            );
          } else if (v.type === "func") {
            // Show dropdown of function names
            const funcNames = Object.keys(tips || {}).filter(n => tips[n]?.kind === "function");
            valueInput = (
              <select value={v.value} onChange={e => setVar(idx, "value", e.target.value)}>
                <option value="">Select function</option>
                {funcNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            );
          } else {
            valueInput = (
              <input
                value={v.value}
                onChange={e => setVar(idx, "value", e.target.value)}
                placeholder="Value"
              />
            );
          }
          return (
            <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <input
                value={v.name}
                onChange={e => setVar(idx, "name", e.target.value)}
                placeholder="Name"
              />
              <select
                value={v.type}
                onChange={e => setVar(idx, "type", e.target.value)}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              {valueInput}
              <button onClick={() => removeVar(idx)}>🗑️</button>
            </div>
          );
        })}
        <button onClick={addVar}>+ Add variable</button>
        <button onClick={handleSave}>Save</button>
      </div>
    );
  }

  // Different editors based on cell type
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
      <div>
        <label>Function name</label>
        <input
          value={data.name || ""}
          onChange={(e) => update("name", e.target.value)}
        />

        <h4>Parameters</h4>
        {params.map((p, idx) => (
          <div key={idx} style={{ display: "flex", gap: 6 }}>
            <input
              value={p.name}
              onChange={(e) => setParam(idx, "name", e.target.value)}
              placeholder="Name"
            />
            <select
              value={p.type}
              onChange={(e) => setParam(idx, "type", e.target.value)}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <input
              value={p.default}
              onChange={(e) => setParam(idx, "default", e.target.value)}
              placeholder="Default"
            />
            <button onClick={() => removeParam(idx)}>🗑️</button>
          </div>
        ))}

        <button onClick={addParam}>+ Add parameter</button>

        <div style={{ marginTop: 8 }}>
          <label>Body</label>
          <Editor
            height="200px"
            defaultLanguage="python"
            value={data.body || ""}
            onChange={(val) => update("body", val)}
          />
        </div>

        <button onClick={handleSave}>Save</button>
      </div>
    );
  }


  // Other cell types stay with inputs
  if (node.type === "loop") {
    return (
      <div>
        <label>Index var</label>
        <input
          value={data.indexVar || "i"}
          onChange={(e) => update("indexVar", e.target.value)}
        />
        <label>Count</label>
        <input
          type="number"
          value={data.count || 5}
          onChange={(e) => update("count", Number(e.target.value))}
        />
        <div>
          <label>Body</label>
          <Editor
            height="200px"
            defaultLanguage="python"
            value={data.body || ""}
            onChange={(val) => update("body", val)}
          />
        </div>
        <button onClick={handleSave}>Save</button>
      </div>
    );
  }

  if (node.type === "condition") {
    return (
      <div>
        <label>Condition</label>
        <input
          value={data.condition || "True"}
          onChange={(e) => update("condition", e.target.value)}
        />
        <button onClick={handleSave}>Save</button>
      </div>
    );
  }


}
