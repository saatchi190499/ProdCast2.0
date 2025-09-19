import React, { useState, useEffect } from "react";
import { Row, LabelInput, LabelSelect, TextArea } from "../ui/FormBits";
import Tooltip from "../ui/Tooltip";
import { TYPE_OPTIONS } from "../utils/helpers";
import CodeEditor from "../ui/CodeEditor";


export default function PropertyEditor({ node, onSave, variableNames = [], functionDefs = [], onCreateFunction }) {
    const [data, setData] = useState(node.data);

    useEffect(() => {
        setData(node.data);
    }, [node]);

    const update = (k, v) => setData((prev) => ({ ...prev, [k]: v }));
    const handleSave = () => { onSave(data); };

    const Common = (
        <LabelInput
            label="Block label"
            tooltip="Shown on the node card."
            value={data.label || ""}
            onChange={(e) => update("label", e.target.value)}
        />
    );

    // ========== START NODE ==========
    if (node.type === "start") {
        return (
            <div style={{ display: "grid", gap: 10 }}>
                <LabelInput
                    label="Block label"
                    value={data.label || "Start"}
                    onChange={(e) => update("label", e.target.value)}
                />
                <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>Imports</div>
                    <CodeEditor
                        value={data.imports || ""}
                        onChange={(val) => update("imports", val)}
                        height="120px"
                    />
                </div>
                <button onClick={handleSave}>Save</button>
            </div>
        );
    }

    // ========== VARIABLE NODE ==========
    if (node.type === "variable") {
        const vars = data.variables || [{ name: "x", type: "int", value: 10, source: { type: "literal" } }];

        const setVar = (idx, key, val) => {
            const nv = vars.map((v, i) => (i === idx ? { ...v, [key]: val } : v));
            update("variables", nv);
        };

        const addRow = () => update("variables", [...vars, { name: "var" + (vars.length + 1), type: "any", value: "" }]);
        const removeRow = (idx) => update("variables", vars.filter((_, i) => i !== idx));

        return (
            <div style={{ display: "grid", gap: 10 }}>
                {Common}
                <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    Variables <Tooltip text="Each row becomes a Python assignment (x = 10)" />
                </div>
                {vars.map((v, idx) => (
                    <Row key={idx} gap={6}>
                        <LabelInput label={`Name #${idx + 1}`} value={v.name} onChange={(e) => setVar(idx, "name", e.target.value)} />
                        <LabelSelect label="Type" options={TYPE_OPTIONS} value={v.type || "any"} onChange={(val) => setVar(idx, "type", val)} />
                        <LabelInput label="Value" value={v.value} onChange={(e) => setVar(idx, "value", e.target.value)} />
                        <button onClick={() => removeRow(idx)} style={{ marginTop: 18 }}>🗑️</button>
                    </Row>
                ))}
                <button onClick={addRow} style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 8 }}>+ Add row</button>
                <button onClick={handleSave}>Save</button>
            </div>
        );
    }

    // ========== FUNCTION NODE ==========
    if (node.type === "function") {
        const params = data.params || [{ name: "x", type: "any", default: "" }];
        const setParam = (idx, key, val) => {
            const np = params.map((p, i) => (i === idx ? { ...p, [key]: val } : p));
            update("params", np);
        };
        const addParam = () => update("params", [...params, { name: "param" + (params.length + 1), type: "any", default: "" }]);
        const removeParam = (idx) => update("params", params.filter((_, i) => i !== idx));

        return (
            <div style={{ display: "grid", gap: 10 }}>
                {Common}
                <LabelInput label="Function name" value={data.name || ""} onChange={(e) => update("name", e.target.value)} />
                <div style={{ fontWeight: 700 }}>Parameters</div>
                {params.map((p, idx) => (
                    <Row key={idx} gap={6}>
                        <LabelInput label={`Name #${idx + 1}`} value={p.name} onChange={(e) => setParam(idx, "name", e.target.value)} />
                        <LabelSelect label="Type" options={TYPE_OPTIONS} value={p.type || "any"} onChange={(val) => setParam(idx, "type", val)} />
                        <LabelInput label="Default" value={p.default} onChange={(e) => setParam(idx, "default", e.target.value)} />
                        <button onClick={() => removeParam(idx)} style={{ marginTop: 18 }}>🗑️</button>
                    </Row>
                ))}
                <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>Function body</div>
                    <CodeEditor
                        value={data.body || ""}
                        onChange={(val) => update("body", val)}
                        height="250px"
                    />
                </div>
                <button onClick={addParam}>+ Add parameter</button>
                <button onClick={handleSave}>Save</button>
            </div>
        );
    }

    // ========== LOOP NODE ==========
    if (node.type === "loop") {
        return (
            <div style={{ display: "grid", gap: 10 }}>
                {Common}
                <LabelInput label="Index variable" value={data.indexVar || "i"} onChange={(e) => update("indexVar", e.target.value)} />
                <LabelInput label="Count" type="number" value={data.count ?? 5} onChange={(e) => update("count", Number(e.target.value))} />
                <TextArea label="Body" value={data.body || ""} onChange={(e) => update("body", e.target.value)} />
                <button onClick={handleSave}>Save</button>
            </div>
        );
    }

    // ========== CONDITION NODE ==========
    if (node.type === "condition") {
        return (
            <div style={{ display: "grid", gap: 10 }}>
                {Common}
                <LabelInput label="Condition" value={data.condition || ""} onChange={(e) => update("condition", e.target.value)} />
                <div style={{ fontSize: 12, color: "#6b7280" }}>Connect green handle for TRUE, red for FALSE.</div>
                <button onClick={handleSave}>Save</button>
            </div>
        );
    }
    // ========== BODY NODE ==========
    if (node.type === "body") {
        return (
            <div style={{ display: "grid", gap: 10 }}>
                <LabelInput
                    label="Block label"
                    value={data.label || ""}
                    onChange={(e) => update("label", e.target.value)}
                />
                <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>Body code</div>
                    <CodeEditor
                        value={data.body || ""}
                        onChange={(val) => update("body", val)}
                    />
                </div>
                <button onClick={handleSave}>Save</button>
            </div>
        );
    }



    return null;
}
