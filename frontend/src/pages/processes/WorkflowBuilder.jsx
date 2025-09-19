import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
    ReactFlowProvider,
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    Background,
    Controls,
    MiniMap,
    Panel,
    Handle,
    Position,
} from "reactflow";
import "reactflow/dist/style.css";

// ---------- Helpers ----------
const nextId = (() => {
    let i = 1;
    return () => String(i++);
})();

const nl = (s = "") => {
    const str = String(s).trimEnd();
    return str.endsWith("\n") ? str : str + "\n";
};

const Modal = ({ isOpen, onClose, children }) => {
    if (!isOpen) return null;

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: "#fff",
                    padding: 20,
                    borderRadius: 12,
                    minWidth: 400,
                    maxWidth: 600,
                    maxHeight: "80vh",
                    overflowY: "auto",
                    position: "relative",
                    display: "grid",
                    gap: 12,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    style={{
                        position: "absolute",
                        top: 10,
                        right: 10,
                        background: "none",
                        border: "none",
                        fontSize: 20,
                        cursor: "pointer",
                        color: "#6b7280"
                    }}
                >
                    &times;
                </button>
                {children}
            </div>
        </div>
    );
};
const downloadText = (filename, text) => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

const TYPE_OPTIONS = ["int", "float", "str", "bool", "any"];

const stringifyByType = (val, type) => {
    if (type === "int") return String(parseInt(val ?? 0, 10));
    if (type === "float") return String(parseFloat(val ?? 0));
    if (type === "bool") return String(val === true || val === "true").toLowerCase();
    if (type === "str") return JSON.stringify(String(val ?? ""));
    // any => try to auto-detect number/bool, else string
    if (val === "true" || val === true) return "true";
    if (val === "false" || val === false) return "false";
    const n = Number(val);
    if (!Number.isNaN(n) && val !== "") return String(n);
    return JSON.stringify(String(val ?? ""));
};

// Proper indentation for Python bodies
const indent = (s, n = 1) => (s || "pass").split("\n").map((line) => "    ".repeat(n) + line).join("\n");

// ---------- UI bits ----------
const Row = ({ children, gap = 8, style = {} }) => (
    <div style={{ display: "flex", gap, alignItems: "center", ...style }}>{children}</div>
);

const LabelInput = ({ label, tooltip, ...props }) => (
    <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
        <span style={{ color: "#374151", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            {label}
            {tooltip && <Tooltip text={tooltip} />}
        </span>
        <input
            {...props}
            style={{
                padding: "6px 8px",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: 12,
            }}
        />
    </label>
);

const LabelSelect = ({ label, options, value, onChange, tooltip }) => (
    <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
        <span style={{ color: "#374151", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            {label}
            {tooltip && <Tooltip text={tooltip} />}
        </span>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 12 }}
        >
            {options.map((o) => (
                <option key={o} value={o}>{o}</option>
            ))}
        </select>
    </label>
);

const TextArea = ({ label, rows = 6, tooltip, ...props }) => (
    <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
        <span style={{ color: "#374151", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            {label}
            {tooltip && <Tooltip text={tooltip} />}
        </span>
        <textarea
            rows={rows}
            {...props}
            style={{
                padding: 8,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 12,
            }}
        />
    </label>
);

const Tooltip = ({ text }) => (
    <span style={{ position: "relative", display: "inline-flex" }}>
        <span
            title={text}
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 16,
                height: 16,
                borderRadius: 999,
                fontSize: 11,
                background: "#eef2ff",
                color: "#3730a3",
                cursor: "help",
                userSelect: "none",
            }}
        >
            i
        </span>
    </span>
);

// ---------- Node components ----------
const Card = ({ title, children, color = "#2563eb", active = false }) => (
    <div style={{
        minWidth: 240,
        background: "#fff",
        border: `1px solid ${active ? color : `${color}22`}`,
        borderRadius: 12,
        boxShadow: active
            ? `0 0 0 3px ${color}33, 0 8px 20px rgba(0,0,0,.10)`
            : "0 4px 14px rgba(0,0,0,.06)",
        padding: 12,
        transition: "box-shadow .15s ease, border-color .15s ease"
    }}>
        <div style={{ fontWeight: 700, marginBottom: 6, color }}>{title}</div>
        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>{children}</div>
    </div>
);


const VariableNode = ({ data }) => {
    const rows = (data.variables || []).map((v) => {
        const t = v.source?.type || "literal";
        if (t === "call" && v.source?.fn) {
            const argStr = (v.source.args || [])
                .map(a => a?.useVar ? (a.varName || "") : stringifyByType(a?.value, a?.type || "any"))
                .join(", ");
            return { name: v.name || "var", type: "call", value: `${v.source.fn}(${argStr})` };
        } else if (t === "var" && v.source?.varName) {
            return { name: v.name || "var", type: "var", value: v.source.varName };
        }
        return { name: v.name || "var", type: v.type || "any", value: String(v.value ?? "") };
    });


    return (
        <div>
            <Handle type="target" position={Position.Left} title="Input flow" />
            <Card title={data.label || "Variables"} color="#0ea5e9" active={!!data.__active}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>name</th>
                            <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>type</th>
                            <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length ? (
                            rows.map((r, idx) => (
                                <tr key={idx}>
                                    <td style={{ padding: "6px 0" }}>{r.name}</td>
                                    <td style={{ padding: "6px 0" }}>{r.type}</td>
                                    <td style={{ padding: "6px 0" }}>{r.value}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={3} style={{ color: "#9ca3af", paddingTop: 6 }}>no variables</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </Card>
            <Handle type="source" position={Position.Right} title="Output flow" />
        </div>
    );
};


const FunctionNode = ({ data }) => (
    <div>
        <Handle type="target" position={Position.Left} title="Input flow" />
        <Card title={data.label || "Function"} color="#10b981" active={!!data.__active}>
            <div>
                <strong>def</strong> {data.name || "fn"}({(data.params || []).map(p => p.name).filter(Boolean).join(", ")})
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>
                <strong>body:</strong> {data.body || "pass"}
            </div>
        </Card>
        <Handle type="source" position={Position.Right} title="Output flow" />
    </div>
);

const LoopNode = ({ data }) => {
    const loopIndex = data.indexVar || "i";
    const loopCount = data.countVar && String(data.countVar).trim() !== "" ? data.countVar : (data.count ?? 5);
    return (
        <div>
            <Handle type="target" position={Position.Left} title="Input flow" />
            {/* body (green) and next (blue) */}
            <Handle id="body" type="source" position={Position.Right} style={{ top: 28, background: "#10b981" }} title="Loop body" />
            <Handle id="next" type="source" position={Position.Right} style={{ top: 64, background: "#3b82f6" }} title="After loop" />
            <Card title={data.label || "Loop"} color="#f59e0b" active={!!data.__active}>
                <div>for {loopIndex} in range({loopCount})</div>
                <div style={{ whiteSpace: "pre-wrap" }}>
                    <strong>body:</strong> {data.body || "pass"}
                </div>
            </Card>
        </div>
    );
};



const ConditionNode = ({ data }) => (
    <div>
        <Handle type="target" position={Position.Left} title="Input flow" />
        {/* two labeled outputs: true / false */}
        <Handle id="true" type="source" position={Position.Right} style={{ top: 20, background: "#10b981" }} title="TRUE branch" />
        <Handle id="false" type="source" position={Position.Right} style={{ top: 60, background: "#ef4444" }} title="FALSE branch" />
        <Card title={data.label || "Condition"} color="#ef4444" active={!!data.__active}>
            <div>if {data.condition || "True"}</div>
            <div style={{ color: "#10b981", fontSize: 11, marginTop: 6 }}>true ➜ connect from green handle</div>
            <div style={{ color: "#ef4444", fontSize: 11 }}>false ➜ connect from red handle</div>
        </Card>
    </div>
);

const nodeTypes = {
    variable: VariableNode,
    function: FunctionNode,
    loop: LoopNode,
    condition: ConditionNode,
};

// ---------- Code generation ----------
const blockToPython = (node) => {
    const d = node.data || {};
    switch (node.type) {
        case "variable": {
            const vars = d.variables || [];
            if (!vars.length) return "# (no variables)";
            return vars
                .filter(v => v.name)
                .map(v => {
                    const t = v.source?.type || "literal";
                    if (t === "call" && v.source?.fn) {
                        const argExpr = (Array.isArray(v.source.args) ? v.source.args : [])
                            .map(a => a?.useVar ? (a.varName || "") : stringifyByType(a?.value, a?.type || "any"))
                            .join(", ");
                        return `${v.name} = ${v.source.fn}(${argExpr})`;
                    } else if (t === "var" && v.source?.varName) {
                        return `${v.name} = ${v.source.varName}`;
                    }
                    return `${v.name} = ${stringifyByType(v.value, v.type || "any")}`;
                })
                .join("\n") + "\n";
        }



        case "function": {
            const params = (d.params || [])
                .filter((p) => p?.name)
                .map((p) => (p.default === undefined || p.default === "" ? `${p.name}` : `${p.name}=${stringifyByType(p.default, p.type || "any")}`))
                .join(", ");
            return `def ${d.name || "fn"}(${params}):\n${indent(d.body, 1)}`;
        }
        case "loop": {
            const countExpr = d.countVar && String(d.countVar).trim() !== "" ? d.countVar : (d.count ?? 5);
            const idx = d.indexVar || "i";
            return `for ${idx} in range(${countExpr}):\n` +
                indent(
                    (d.body ? nl(d.body) : "pass\n"),
                    1
                );
        }
        case "condition": {
            // structure placeholder; nested generation could follow edges later
            return `# If block: connect true/false handles to downstream blocks\nif ${d.condition || "True"}:\n    pass\nelse:\n    pass`;
        }
        default:
            return "# Unknown block";
    }
};

// ---------- Recursive code generation WITH segments (loop + condition) ----------
const generateCodeWithSegments = (nodes, edges) => {
    if (!nodes.length) return { code: "# add blocks to generate code", segments: [] };

    const byId = new Map(nodes.map(n => [n.id, n]));
    const children = new Map();
    const incoming = new Map(nodes.map(n => [n.id, 0]));

    for (const e of edges) {
        if (byId.has(e.source) && byId.has(e.target)) {
            if (!children.has(e.source)) children.set(e.source, []);
            children.get(e.source).push(e);
            incoming.set(e.target, (incoming.get(e.target) || 0) + 1);
        }
    }

    const getNode = (x) => {
        if (!x) return null;
        if (typeof x === "string") return byId.get(x);
        if (x.id && byId.has(x.id)) return byId.get(x.id);
        if (x.target && byId.has(x.target)) return byId.get(x.target);
        return null;
    };

    const sortPos = (a, b) => {
        const na = getNode(a);
        const nb = getNode(b);
        if (!na || !nb) return 0;
        return (na.position.x - nb.position.x) || (na.position.y - nb.position.y);
    };

    for (const [k, arr] of children) arr.sort((ea, eb) => sortPos(ea, eb));

    const roots = [...incoming.entries()]
        .filter(([id, deg]) => deg === 0)
        .map(([id]) => id)
        .sort((a, b) => sortPos(a, b));

    const segments = [];
    const visited = new Set();

    const emit = (nodeId, raw, indentLevel) => {
        const text = indent(raw.trimEnd(), indentLevel) + "\n";
        segments.push({ nodeId, text });
        return text;
    };

    const renderNode = (id, indentLevel = 0) => {
        if (visited.has(id)) return "";
        visited.add(id);

        const node = byId.get(id);
        if (!node) return "";

        const d = node.data || {};
        let out = "";

        if (node.type === "loop") {
            const countExpr = d.countVar && String(d.countVar).trim() !== "" ? d.countVar : (d.count ?? 5);
            const idx = d.indexVar || "i";
            let loopChunk = `for ${idx} in range(${countExpr}):\n`;
            if (d.body) loopChunk += indent(d.body, 1) + "\n";
            out += emit(node.id, loopChunk.trimEnd(), indentLevel);

            const kids = children.get(id) || [];
            const bodyKids = kids.filter(e => e.sourceHandle ? e.sourceHandle === "body" : true);
            const nextKids = kids.filter(e => e.sourceHandle === "next");

            for (const e of bodyKids) out += renderNodeIndented(e.target, indentLevel + 1);
            for (const e of nextKids) out += renderNode(e.target, indentLevel);

            return out;
        }

        if (node.type === "condition") {
            let condChunk = `if ${d.condition || "True"}:\n`;
            out += emit(node.id, condChunk.trimEnd(), indentLevel);

            const kids = children.get(id) || [];
            const trueKids = kids.filter(e => e.sourceHandle === "true");
            const falseKids = kids.filter(e => e.sourceHandle === "false");

            if (trueKids.length) {
                for (const e of trueKids) out += renderNodeIndented(e.target, indentLevel + 1);
            } else {
                out += emit(node.id, "pass", indentLevel + 1);
            }

            out += emit(node.id, "else:", indentLevel);

            if (falseKids.length) {
                for (const e of falseKids) out += renderNodeIndented(e.target, indentLevel + 1);
            } else {
                out += emit(node.id, "pass", indentLevel + 1);
            }

            return out;
        }

        // default: variable/function blocks
        out += emit(node.id, blockToPython(node), indentLevel);

        // sequential children
        const kids = children.get(id) || [];
        for (const e of kids) out += renderNode(e.target, indentLevel);

        return out;
    };

    const renderNodeIndented = (id, indentLevel) => {
        const chunk = renderNode(id, indentLevel);
        return indent(chunk.trimEnd(), 0) + (chunk.endsWith("\n") ? "" : "\n");
    };

    let code = "";
    if (roots.length) {
        for (const r of roots) code += renderNode(r, 0);
    } else {
        // No explicit roots: just render positional order
        const all = [...nodes].sort((a, b) => sortPos(a, b));
        for (const n of all) {
            if (!visited.has(n.id)) code += renderNode(n.id, 0);
        }
    }

    return { code: code.trim() || "# add blocks to generate code", segments };
};


// ---------- Structural execution plan (for debugger) ----------
const makePlan = (nodes, edges) => {
    const byId = new Map(nodes.map(n => [n.id, n]));

    // adjacency with handle info
    const out = new Map(); // nodeId -> [edge,...]
    const inDeg = new Map(nodes.map(n => [n.id, 0]));
    for (const e of edges) {
        if (!byId.has(e.source) || !byId.has(e.target)) continue;
        if (!out.has(e.source)) out.set(e.source, []);
        out.get(e.source).push(e);
        inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1);
    }

    // stable position order
    const sortPos = (a, b) =>
        (a.position.x - b.position.x) || (a.position.y - b.position.y);

    for (const [k, arr] of out) {
        arr.sort((ea, eb) => sortPos(byId.get(ea.target), byId.get(eb.target)));
    }

    const roots = nodes
        .filter(n => (inDeg.get(n.id) || 0) === 0)
        .sort(sortPos);

    // Recursively build plan
    const visit = (id) => {
        const n = byId.get(id);
        if (!n) return null;

        if (n.type === "loop") {
            const edgesFrom = out.get(id) || [];
            const bodyEdges = edgesFrom.filter(e => e.sourceHandle ? e.sourceHandle === "body" : true);
            const nextEdges = edgesFrom.filter(e => e.sourceHandle === "next");

            return {
                kind: "loop",
                nodeId: id,
                indexVar: (n.data?.indexVar || "i"),
                countExpr: (n.data?.countVar && String(n.data.countVar).trim() !== "") ? n.data.countVar : (n.data?.count ?? 5),
                header: `for ${n.data?.indexVar || "i"} in range(${(n.data?.countVar && String(n.data.countVar).trim() !== "") ? n.data.countVar : (n.data?.count ?? 5)}):`,
                preBody: (n.data?.body ? n.data.body : ""), // static text from node
                body: bodyEdges.map(e => visit(e.target)).filter(Boolean),
                next: nextEdges.map(e => visit(e.target)).filter(Boolean)
            };
        }

        if (n.type === "condition") {
            const edgesFrom = out.get(id) || [];
            const trueKids = edgesFrom.filter(e => e.sourceHandle === "true").map(e => visit(e.target)).filter(Boolean);
            const falseKids = edgesFrom.filter(e => e.sourceHandle === "false").map(e => visit(e.target)).filter(Boolean);
            return {
                kind: "condition",
                nodeId: id,
                condition: (n.data?.condition || "True"),
                trueKids,
                falseKids
            };
        }

        // default: emit this node then children sequentially
        const children = (out.get(id) || []).map(e => visit(e.target)).filter(Boolean);
        return { kind: "plain", nodeId: id, code: blockToPython(n), children };
    };

    return roots.map(r => visit(r.id)).filter(Boolean);
};

// ---------- Build debug queue from plan (evaluates loop counts) ----------
const buildDebugQueue = async (pyodide, plan) => {
    const q = [];

    const pushExec = (nodeId, text) => q.push({ type: "exec", nodeId, text: nl(text) });

    const runNodeList = async (nodes) => {
        for (const n of nodes) await runNode(n);
    };

    const renderPlain = (node) => node.code.endsWith("\n") ? node.code : node.code + "\n";

    const runNode = async (node) => {
        if (!node) return;

        if (node.kind === "plain") {
            pushExec(node.nodeId, renderPlain(node));
            await runNodeList(node.children || []);
            return;
        }

        if (node.kind === "condition") {
            // No markers; if you want to actually choose a branch at runtime,
            // eval node.condition in pyodide and pick one. For now, emit both.
            // TRUE branch
            for (const kid of (node.trueKids || [])) await runNode(kid);
            // FALSE branch
            for (const kid of (node.falseKids || [])) await runNode(kid);
            return;
        }

        if (node.kind === "loop") {
            // Evaluate count in Python env
            let countVal = 0;
            try {
                countVal = await pyodide.runPythonAsync(String(node.countExpr));
                countVal = Number.isFinite(Number(countVal)) ? Math.trunc(Number(countVal)) : 0;
            } catch {
                countVal = 0;
            }
            countVal = Math.max(0, countVal);

            for (let k = 0; k < countVal; k++) {
                // index assignment (belongs to LOOP node)
                pushExec(node.nodeId, `${node.indexVar} = ${k}`);

                // optional loop pre-body (still LOOP node)
                if (node.preBody && node.preBody.trim()) {
                    pushExec(node.nodeId, nl(node.preBody.trimEnd()));
                }

                // each body child gets ITS OWN nodeId + newline
                for (const child of (node.body || [])) {
                    await expandChildAsExecItems(child);
                }
            }

            // 4) after-loop chain
            for (const next of (node.next || [])) {
                await runNode(next);
            }
            return;
        }
    };
    async function expandChildAsExecItems(child) {
        if (!child) return;

        if (child.kind === "plain") {
            const code = nl(child.code);   // <— normalize here
            pushExec(child.nodeId, code);

            // and any sequential children of that node:
            for (const c of (child.children || [])) {
                await expandChildAsExecItems(c);
            }
            return;
        }

        if (child.kind === "loop" || child.kind === "condition") {
            const subQ = await buildDebugQueue(pyodide, [child]);
            for (const it of subQ) {
                if (it.type === "exec") pushExec(it.nodeId, nl(it.text));
            }
        }
    }

    await runNodeList(plan);
    return q;
};

// ---------- Graph-aware code generation (uses edges + loop body/next) ----------
const getNodeById = (nodesMap, id) => nodesMap.get(id) || null;

const sortByPosition = (aNode, bNode) =>
    (aNode.position.x - bNode.position.x) || (aNode.position.y - bNode.position.y);

// Returns Python code string for the subgraph rooted at nodeId
function buildCode(nodeId, nodes, edges, visited = new Set(), indentLevel = 0) {
    if (!nodeId || visited.has(nodeId)) return "";
    visited.add(nodeId);

    const byId = new Map(nodes.map(n => [n.id, n]));
    const node = getNodeById(byId, nodeId);
    if (!node) return "";

    const outEdges = edges.filter(e => e.source === node.id);
    // Stable order for multiple outgoing edges
    outEdges.sort((ea, eb) => {
        const na = byId.get(ea.target);
        const nb = byId.get(eb.target);
        if (!na || !nb) return 0;
        return sortByPosition(na, nb);
    });

    // Loop: split children by handle: body vs next
    if (node.type === "loop") {
        const bodyEdges = outEdges.filter(e => e.sourceHandle === "body" || e.sourceHandle == null); // default to body if not set
        const nextEdges = outEdges.filter(e => e.sourceHandle === "next");

        const d = node.data || {};
        const countExpr = d.countVar && String(d.countVar).trim() !== "" ? d.countVar : (d.count ?? 5);
        const idx = d.indexVar || "i";

        // Loop header
        let code = indent(`for ${idx} in range(${countExpr}):`, indentLevel) + "\n";

        // Loop body: either connected blocks or the node's own body text
        if (bodyEdges.length === 0 && !d.body) {
            code += indent("pass", indentLevel + 1) + "\n";
        } else {
            if (d.body) {
                code += indent(d.body.trimEnd(), indentLevel + 1) + "\n";
            }
            for (const e of bodyEdges) {
                code += buildCode(e.target, nodes, edges, visited, indentLevel + 1);
            }
        }

        // After loop — same indentation as loop header
        for (const e of nextEdges) {
            code += buildCode(e.target, nodes, edges, visited, indentLevel);
        }
        return code;
    }

    // Condition: true/false branches by handle ids
    if (node.type === "condition") {
        const d = node.data || {};
        const cond = d.condition || "True";
        const trueEdges = outEdges.filter(e => e.sourceHandle === "true");
        const falseEdges = outEdges.filter(e => e.sourceHandle === "false");

        let code = indent(`if ${cond}:`, indentLevel) + "\n";
        if (trueEdges.length === 0) {
            code += indent("pass", indentLevel + 1) + "\n";
        } else {
            for (const e of trueEdges) {
                code += buildCode(e.target, nodes, edges, visited, indentLevel + 1);
            }
        }
        code += indent("else:", indentLevel) + "\n";
        if (falseEdges.length === 0) {
            code += indent("pass", indentLevel + 1) + "\n";
        } else {
            for (const e of falseEdges) {
                code += buildCode(e.target, nodes, edges, visited, indentLevel + 1);
            }
        }
        return code;
    }

    // Default blocks (variable/function/etc.) + sequential children (no handle id)
    let code = indent((blockToPython(node) || "").trimEnd(), indentLevel) + "\n";
    const seqEdges = outEdges.filter(e => !e.sourceHandle);
    for (const e of seqEdges) {
        code += buildCode(e.target, nodes, edges, visited, indentLevel);
    }
    return code;
}

// ---------- Recursive code generation with nesting (loop + condition) ----------
const generateCodeFromGraph = (nodes, edges) => {
    const byId = new Map(nodes.map(n => [n.id, n]));
    const children = new Map();

    // Build adjacency list with handle info
    for (const e of edges) {
        if (byId.has(e.source) && byId.has(e.target)) {
            if (!children.has(e.source)) children.set(e.source, []);
            children.get(e.source).push(e);
        }
    }

    // Sort by position for consistent order
    const getNode = (x) => {
        if (!x) return null;
        if (typeof x === "string") return byId.get(x);   // node id
        if (x.id && byId.has(x.id)) return byId.get(x.id); // node object
        if (x.target && byId.has(x.target)) return byId.get(x.target); // edge
        return null;
    };

    const sortPos = (a, b) => {
        const na = getNode(a);
        const nb = getNode(b);
        if (!na || !nb) return 0;
        return (na.position.x - nb.position.x) || (na.position.y - nb.position.y);
    };

    const visited = new Set();

    const renderNode = (id, indentLevel = 0) => {
        if (visited.has(id)) return "";
        visited.add(id);

        const node = byId.get(id);
        if (!node) return "";

        const d = node.data || {};
        let code = "";

        if (node.type === "loop") {
            const countExpr =
                d.countVar && String(d.countVar).trim() !== ""
                    ? d.countVar
                    : (d.count ?? 5);
            const idx = d.indexVar || "i";
            code += `for ${idx} in range(${countExpr}):\n`;

            // body children (connected to "body" handle)
            const kids = children.get(id) || [];
            const bodyKids = kids.filter(e => e.sourceHandle === "body");
            if (bodyKids.length) {
                for (const e of bodyKids) {
                    code += renderNodeIndented(e.target, indentLevel + 1);
                }
            } else {
                code += indent("pass", indentLevel + 1) + "\n";
            }

            // after loop (connected to "next" handle)
            const nextKids = kids.filter(e => e.sourceHandle === "next");
            for (const e of nextKids) {
                code += renderNode(e.target, indentLevel);
            }

            return code;
        }


        if (node.type === "condition") {
            code += `if ${d.condition || "True"}:\n`;
            const kids = children.get(id) || [];
            const trueKids = kids.filter(e => e.sourceHandle === "true");
            const falseKids = kids.filter(e => e.sourceHandle === "false");

            if (trueKids.length) {
                for (const e of trueKids) {
                    code += renderNodeIndented(e.target, indentLevel + 1);
                }
            } else {
                code += indent("pass", indentLevel + 1) + "\n";
            }

            code += `else:\n`;
            if (falseKids.length) {
                for (const e of falseKids) {
                    code += renderNodeIndented(e.target, indentLevel + 1);
                }
            } else {
                code += indent("pass", indentLevel + 1) + "\n";
            }

            return code;
        }

        // Normal blocks (variable, function, etc.)
        code += blockToPython(node) + "\n";

        // Sequential children
        const kids = children.get(id) || [];
        for (const e of kids) {
            code += renderNode(e.target, indentLevel);
        }

        return code;
    };

    const renderNodeIndented = (id, indentLevel) => {
        const block = renderNode(id, indentLevel);
        return indent(block.trimEnd(), indentLevel) + "\n";
    };

    // Find root nodes (no incoming edges)
    const incoming = new Map(nodes.map(n => [n.id, 0]));
    for (const e of edges) {
        if (incoming.has(e.target)) {
            incoming.set(e.target, incoming.get(e.target) + 1);
        }
    }
    let roots = [...incoming.entries()]
        .filter(([id, deg]) => deg === 0)
        .map(([id]) => id);

    roots.sort((a, b) => sortPos(byId.get(a), byId.get(b)));

    let finalCode = "";
    for (const r of roots) {
        finalCode += renderNode(r, 0);
    }

    return finalCode.trim() || "# add blocks to generate code";
};



// ---------- Pyodide Executor ----------
let __pyodidePromise = null;
async function loadPyodideOnce(setStatus) {
    if (window.__pyodide) return window.__pyodide;
    if (__pyodidePromise) {
        setStatus && setStatus("loading");
        const py = await __pyodidePromise;
        setStatus && setStatus("ready");
        return py;
    }

    setStatus && setStatus("loading");

    __pyodidePromise = new Promise((resolve, reject) => {
        const SRC = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js";
        let tag = document.getElementById("pyodide-script");

        const finish = async () => {
            // wait until the global function is actually defined
            for (let i = 0; i < 80; i++) {
                if (typeof globalThis.loadPyodide === "function" || typeof window.loadPyodide === "function") break;
                await new Promise((r) => setTimeout(r, 50));
            }
            const load = globalThis.loadPyodide || window.loadPyodide;
            if (typeof load !== "function") {
                reject(new Error("Pyodide script loaded but global loadPyodide is not available"));
                return;
            }
            try {
                const py = await load({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/" });
                window.__pyodide = py;
                resolve(py);
            } catch (e) {
                reject(e);
            }
        };

        const onerror = (e) => reject(new Error("Failed to load Pyodide script"));

        if (!tag) {
            tag = document.createElement("script");
            tag.id = "pyodide-script";
            tag.src = SRC;
            tag.async = true;
            tag.onload = finish;
            tag.onerror = onerror;
            document.body.appendChild(tag);
        } else {
            // script tag already exists; attach listeners or finish if already ready
            if (typeof globalThis.loadPyodide === "function" || typeof window.loadPyodide === "function") {
                finish();
            } else {
                tag.addEventListener("load", finish, { once: true });
                tag.addEventListener("error", onerror, { once: true });
            }
        }
    });

    try {
        const py = await __pyodidePromise;
        setStatus && setStatus("ready");
        return py;
    } catch (e) {
        setStatus && setStatus("idle");
        __pyodidePromise = null; // allow retry on next call
        throw e;
    }
}

// Split code into executable blocks by blank lines
const splitIntoBlocks = (code) =>
    code
        .replace(/\r\n/g, "\n")
        .split(/\n\s*\n/)
        .map((b) => b.trimEnd())
        .filter(Boolean);

function Executor({ queue, onStepChange, onReset }) {
    const [status, setStatus] = useState("idle");
    const [out, setOut] = useState("");
    const [err, setErr] = useState("");
    const [idx, setIdx] = useState(0);

    const appendOut = useCallback((s) => setOut((p) => p + (s ?? "")), []);
    const appendErr = useCallback((s) => setErr((p) => p + (s ?? "")), []);

    const pyoRef = useRef(null);

    const ensureInit = useCallback(async () => {
        let pyo = pyoRef.current;
        if (!pyo) {
            setStatus("loading");
            pyo = await loadPyodideOnce(setStatus);
            pyoRef.current = pyo;
        }
        // (re)wire all streams every time (some pyodide builds drop them)
        try {
            if (pyo.setStdout) {
                pyo.setStdout({
                    batched: appendOut,
                    line: appendOut,
                    raw: appendOut,
                });
            } else {
                // very old pyodide fallback
                pyo.stdout = appendOut;
            }
            if (pyo.setStderr) {
                pyo.setStderr({
                    batched: appendErr,
                    line: appendErr,
                    raw: appendErr,
                });
            } else {
                pyo.stderr = appendErr;
            }
        } catch {/* ignore */ }
        setStatus("ready");
        return pyo;
    }, [appendOut, appendErr]);

    const init = useCallback(async () => { await ensureInit(); }, [ensureInit]);

    const reset = useCallback(() => {
        setOut(""); setErr(""); setIdx(0);
        onReset && onReset();
    }, [onReset]);

    const step = useCallback(async () => {
        const pyo = await loadPyodideOnce(setStatus);
        if (!queue?.length || idx >= queue.length) return;

        setStatus("running");
        const item = queue[idx];
        try {
            // 🔑 always rewire handlers before running
            if (pyo.setStdout) {
                pyo.setStdout({
                    batched: (s) => setOut((prev) => prev + s),
                    line: (s) => setOut((prev) => prev + s + "\n"),
                });
            }
            if (pyo.setStderr) {
                pyo.setStderr({
                    batched: (s) => setErr((prev) => prev + s),
                    line: (s) => setErr((prev) => prev + s + "\n"),
                });
            }

            onStepChange && onStepChange(idx, item);

            if (item.type === "exec" && item.text) {
                let code = String(item.text);
                if (!code.endsWith("\n")) code += "\n";
                await pyo.runPythonAsync(code);
            }

            // 🔑 after finishing a step, insert a newline separator
            setOut((prev) => prev.trimEnd() + "\n");
            setIdx((i) => i + 1);
        } catch (e) {
            setErr((prev) => prev.trimEnd() + "\n" + String(e) + "\n");
        } finally {
            setStatus("ready");
        }
    }, [idx, queue, onStepChange]);

    const runAll = useCallback(async () => {
        const pyo = await ensureInit();
        setStatus("running");
        try {
            for (let i = idx; i < (queue?.length || 0); i++) {
                const item = queue[i];
                onStepChange && onStepChange(i, item);
                if (item.type === "exec" && item.text != null) {
                    let code = String(item.text);
                    if (!code.endsWith("\n")) code += "\n";
                    await pyo.runPythonAsync(code);
                }
                setIdx(i + 1);
            }
        } catch (e) {
            appendErr(String(e) + "\n");
        } finally {
            setStatus("ready");
        }
    }, [idx, queue, onStepChange, ensureInit, appendErr]);

    // reset only if queue content changed
    const prevHashRef = useRef("");
    useEffect(() => {
        const hash = !queue ? "0" : String(queue.length) + "|" + queue.map(q => q.nodeId + ":" + (q.text || "")).join("||");
        if (hash !== prevHashRef.current) {
            prevHashRef.current = hash;
            setIdx(0);
            onReset && onReset();
        }
    }, [queue, onReset]);

    // quick sanity check to confirm stdout wiring
    const smoke = useCallback(async () => {
        const pyo = await ensureInit();
        try {
            await pyo.runPythonAsync(`print("stdout OK")`);
        } catch (e) {
            appendErr(String(e) + "\n");
        }
    }, [ensureInit, appendErr]);

    return (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <TBtn onClick={init}>Init Python</TBtn>
                <TBtn onClick={step}>Step ▶</TBtn>
                <TBtn onClick={runAll}>Run All ⏭</TBtn>
                <TBtn onClick={reset}>Reset ⟲</TBtn>
                <TBtn onClick={smoke}>Test stdout</TBtn>
                <span style={{ fontSize: 12, color: status === "ready" ? "#10b981" : status === "loading" ? "#f59e0b" : status === "running" ? "#6366f1" : "#6b7280" }}>
                    status: {status}
                </span>
            </div>
            <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Stdout</div>
                <pre style={{ margin: 0, background: "#0b1021", color: "#e5e7eb", minHeight: 120, padding: 8, borderRadius: 8 }}>{out || "(no output yet)"}</pre>
            </div>
            <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Stderr</div>
                <pre style={{ margin: 0, background: "#1f2937", color: "#fecaca", minHeight: 80, padding: 8, borderRadius: 8 }}>{err || "(no errors)"}</pre>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Steps: {queue?.length ?? 0} • Next index: {idx + 1}</div>
        </div>
    );
}


// ---------- Property Editor ----------
function PropertyEditor({ node, onSave, variableNames, functionDefs = [], onCreateFunction }) {

    const [data, setData] = useState(node.data);

    useEffect(() => {
        setData(node.data);
    }, [node]);

    const update = (k, v) => setData((prev) => ({ ...prev, [k]: v }));

    const handleSave = () => {
        onSave(data);
    };

    const Common = (
        <LabelInput
            label="Block label"
            tooltip="Shown on the node card."
            value={data.label || ""}
            onChange={(e) => update("label", e.target.value)}
        />
    );



    if (node.type === "variable") {
        const vars =
            data.variables ||
            [{ name: "x", type: "int", value: 10, source: { type: "literal" } }];

        const coerceSource = (v) => {
            // normalize legacy items
            const src = v.source && typeof v.source === "object" ? v.source : { type: "literal" };

            if (src.type === "call") {
                const fnName = src.fn || (functionDefs[0]?.name ?? "");
                const fnParams = functionDefs.find((f) => f.name === fnName)?.params || [];
                const args = src.args || [];
                const normArgs = fnParams.map((p, i) => {
                    const a = args[i] || {};
                    return {
                        param: p,
                        useVar: a.useVar ?? true,
                        varName: a.varName ?? (variableNames[0] || ""),
                        type: a.type ?? "any",
                        value: a.value ?? "",
                    };
                });
                return { ...v, source: { type: "call", fn: fnName, args: normArgs } };
            }

            if (src.type === "var") {
                return { ...v, source: { type: "var", varName: src.varName || (variableNames[0] || "") } };
            }

            // default literal
            return { ...v, source: { type: "literal" } };
        };


        const setVar = (idx, key, val) => {
            const nv = vars.map((v, i) => (i === idx ? coerceSource({ ...v, [key]: val }) : v));
            update("variables", nv);
        };

        const setVarSource = (idx, source) => {
            const nv = vars.map((v, i) =>
                i === idx
                    ? coerceSource({
                        ...v,
                        source:
                            source === "call"
                                ? {
                                    type: "call",
                                    fn: functionDefs[0]?.name ?? "",
                                    args: (functionDefs[0]?.params || []).map((p) => ({
                                        param: p,
                                        useVar: true,
                                        varName: variableNames[0] || "",
                                        type: "any",
                                        value: "",
                                    })),
                                }
                                : source === "var"
                                    ? { type: "var", varName: variableNames[0] || "" }
                                    : { type: "literal" },
                    })
                    : v
            );
            update("variables", nv);
        };


        const setCallField = (idx, field, value) => {
            const v = vars[idx];
            const src = v.source && typeof v.source === "object" ? v.source : { type: "literal" };
            let next = src;

            if (src.type === "call" && field === "fn") {
                const chosen = functionDefs.find((f) => f.name === value) || { name: value, params: [] };
                next = {
                    type: "call",
                    fn: chosen.name,
                    args: chosen.params.map((p, i) => {
                        const prev = src.args?.[i] || {};
                        return {
                            param: p,
                            useVar: prev.useVar ?? true,
                            varName: prev.varName ?? (variableNames[0] || ""),
                            type: prev.type ?? "any",
                            value: prev.value ?? "",
                        };
                    }),
                };
            } else if (src.type === "var" && field === "varName") {
                next = { type: "var", varName: value };
            } else {
                next = { ...src, [field]: value };
            }

            setVar(idx, "source", next);
        };


        const setCallArg = (idx, argIndex, patch) => {
            const v = vars[idx];
            const src = v.source;
            const args = (src.args || []).map((a, i) => (i === argIndex ? { ...a, ...patch } : a));
            setVar(idx, "source", { ...src, args });
        };

        const addRow = () =>
            update("variables", [
                ...vars,
                { name: "var" + (vars.length + 1), type: "any", value: "", source: { type: "literal" } },
            ]);

        const removeRow = (idx) => update("variables", vars.filter((_, i) => i !== idx));

        return (
            <div style={{ display: "grid", gap: 10 }}>
                {Common}
                <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    Variables{" "}
                    <Tooltip text="Choose Literal (x = 10) or Function call (x = my_fn(a, b)). Values are serialized as valid Python." />
                </div>

                {vars.map((v, idx) => {
                    const src = (v.source?.type ? v.source : { type: "literal" });
                    const sourceType = src.type; // 'literal' | 'call'
                    const hasFunctions = functionDefs.length > 0;

                    const MissingFnWarning = ({ fnName }) => (
                        <div style={{
                            marginTop: 8,
                            padding: 8,
                            borderRadius: 8,
                            border: "1px solid #fca5a5",
                            background: "#fef2f2",
                            color: "#991b1b",
                            fontSize: 12
                        }}>
                            Selected function <code>{fnName || "(empty)"}</code> doesn’t exist in your canvas.
                            Choose another function or{" "}
                            <button
                                type="button"
                                onClick={() => onCreateFunction && onCreateFunction()}
                                style={{ textDecoration: "underline", border: "none", background: "transparent", cursor: "pointer", color: "#991b1b" }}
                            >
                                add a Function block
                            </button>.
                        </div>
                    );
                    return (
                        <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}>
                            <Row gap={6}>
                                <LabelInput
                                    label={`Name #${idx + 1}`}
                                    tooltip="Python identifier (e.g., rate, x1)."
                                    value={v.name}
                                    onChange={(e) => setVar(idx, "name", e.target.value)}
                                />
                                <LabelSelect
                                    label="Value source"
                                    tooltip="Use a literal value or a function call result."
                                    options={["literal", "call", "var"]}
                                    value={sourceType}
                                    onChange={(val) => setVarSource(idx, val)}
                                />
                                <button onClick={() => removeRow(idx)} style={{ marginTop: 18 }}>🗑️</button>
                            </Row>

                            {/* LITERAL MODE */}
                            {sourceType === "literal" && (
                                <Row gap={6}>
                                    <LabelSelect
                                        label="Type"
                                        tooltip="Affects how the value is serialized in Python."
                                        options={TYPE_OPTIONS}
                                        value={v.type || "any"}
                                        onChange={(val) => setVar(idx, "type", val)}
                                    />
                                    <LabelInput
                                        label="Value"
                                        tooltip="Examples: 10, 3.14, true, 'hello'"
                                        value={v.value}
                                        onChange={(e) => setVar(idx, "value", e.target.value)}
                                    />
                                </Row>
                            )}

                            {/* FUNCTION CALL MODE */}
                            {sourceType === "call" && hasFunctions && (
                                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                                    <LabelSelect
                                        label="Function"
                                        tooltip="Choose from your existing Function blocks"
                                        options={functionDefs.map((f) => f.name)}
                                        value={src.fn || (functionDefs[0]?.name ?? "")}
                                        onChange={(val) => setCallField(idx, "fn", val)}
                                    />

                                    {(src.args || []).map((a, aIdx) => (
                                        <div key={aIdx} style={{ border: "1px dashed #d1d5db", borderRadius: 8, padding: 8 }}>
                                            <div style={{ fontSize: 12, marginBottom: 6 }}>
                                                Argument for <code>{a.param}</code>
                                            </div>
                                            <Row gap={8}>
                                                <LabelSelect
                                                    label="Arg source"
                                                    options={["variable", "literal"]}
                                                    value={a.useVar ? "variable" : "literal"}
                                                    onChange={(val) =>
                                                        setCallArg(idx, aIdx, { useVar: val === "variable" })
                                                    }
                                                />
                                                {a.useVar ? (
                                                    <LabelSelect
                                                        label="Variable"
                                                        options={variableNames.length ? variableNames : [""]}
                                                        value={a.varName || (variableNames[0] || "")}
                                                        onChange={(val) => setCallArg(idx, aIdx, { varName: val })}
                                                    />
                                                ) : (
                                                    <>
                                                        <LabelSelect
                                                            label="Type"
                                                            options={TYPE_OPTIONS}
                                                            value={a.type || "any"}
                                                            onChange={(val) => setCallArg(idx, aIdx, { type: val })}
                                                        />
                                                        <LabelInput
                                                            label="Value"
                                                            value={a.value ?? ""}
                                                            onChange={(e) => setCallArg(idx, aIdx, { value: e.target.value })}
                                                        />
                                                    </>
                                                )}
                                            </Row>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {sourceType === "var" && (
                                <Row gap={6}>
                                    <LabelSelect
                                        label="From variable"
                                        tooltip="Choose an existing variable to copy its value."
                                        options={variableNames.length ? variableNames : [""]}
                                        value={src.varName || (variableNames[0] || "")}
                                        onChange={(val) => setCallField(idx, "varName", val)}
                                    />
                                </Row>
                            )}

                            {sourceType === "call" && hasFunctions && src.fn && !functionDefs.some(f => f.name === src.fn) && (
                                <MissingFnWarning fnName={src.fn} />
                            )}
                        </div>
                    );
                })}

                <button onClick={addRow} style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 8 }}>
                    + Add row
                </button>
                <button onClick={handleSave}>Save</button>
            </div>
        );
    }

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
                <LabelInput label="Function name" tooltip="Example: calc_sum" value={data.name || ""} onChange={(e) => update("name", e.target.value)} />
                <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    Parameters <Tooltip text="Add rows. Default is optional (e.g., x=10)." />
                </div>
                {params.map((p, idx) => (
                    <Row key={idx} gap={6}>
                        <LabelInput label={`Name #${idx + 1}`} tooltip="Python identifier." value={p.name} onChange={(e) => setParam(idx, "name", e.target.value)} />
                        <LabelSelect label="Type" tooltip="Used only for default value serialization." options={TYPE_OPTIONS} value={p.type || "any"} onChange={(val) => setParam(idx, "type", val)} />

                        <LabelInput label="Default (optional)" tooltip="Examples: 0, 3.14, true, 'txt'" value={p.default} onChange={(e) => setParam(idx, "default", e.target.value)} />
                        <button onClick={() => removeParam(idx)} style={{ marginTop: 18 }}>🗑️</button>
                    </Row>
                ))}
                <TextArea label="Body" tooltip="Write Python statements. They will be indented inside the function." value={data.body || ""} onChange={(e) => update("body", e.target.value)} />
                <button onClick={addParam} style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 8, width: "fit-content" }}>+ Add parameter</button>
                <button onClick={handleSave}>Save</button>
            </div>
        );
    }

    if (node.type === "loop") {
        const countVar = data.countVar || "";
        return (
            <div style={{ display: "grid", gap: 10 }}>
                {Common}
                <LabelInput label="Index variable" tooltip="Loop variable name (e.g., i, idx)." value={data.indexVar || "i"} onChange={(e) => update("indexVar", e.target.value)} />
                <Row gap={8}>
                    <LabelInput label="Count (number)" tooltip="Non-negative integer (e.g., 5)." type="number" value={data.count ?? 5} onChange={(e) => update("count", Number(e.target.value))} />
                    <LabelSelect
                        label="Or use variable"
                        tooltip="Choose a variable name from Variables blocks to use as range count."
                        options={["", ...variableNames]}
                        value={countVar}
                        onChange={(val) => update("countVar", val)}
                    />
                </Row>
                <TextArea label="Body" tooltip="Python statements executed each iteration." value={data.body || ""} onChange={(e) => update("body", e.target.value)} />
                <button onClick={handleSave}>Save</button>
            </div>
        );
    }

    if (node.type === "condition") {
        return (
            <div style={{ display: "grid", gap: 10 }}>
                {Common}
                <LabelInput label="Condition (Python expr)" tooltip="Examples: x > 0, status == 'OK', i % 2 == 0" value={data.condition || ""} onChange={(e) => update("condition", e.target.value)} />
                <div style={{ fontSize: 12, color: "#6b7280" }}>Connect green handle for TRUE branch, red for FALSE.</div>
                <button onClick={handleSave}>Save</button>
            </div>
        );
    }

    return null;
}

// ---------- Toolbar Button ----------
const TBtn = ({ onClick, children }) => (
    <button
        onClick={onClick}
        style={{
            padding: "6px 10px",
            fontSize: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#fff",
            cursor: "pointer",
        }}
        title="Click to add"
    >
        {children}
    </button>
);

// ---------- Main Component ----------
export default function WorkflowEditor() {
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalNode, setModalNode] = useState(null);
    const [execQueue, setExecQueue] = useState([]);
    const pyodideRef = useRef(null);
    const rf = useRef(null);

    const ensurePyodide = useCallback(async () => {
        if (pyodideRef.current) return pyodideRef.current;
        pyodideRef.current = await loadPyodideOnce();
        return pyodideRef.current;
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const pyo = await ensurePyodide();

            // 1) Generate normal Python and run it up to current point? (Not needed here)
            // 2) Build plan from graph
            const plan = makePlan(nodes, edges);

            // 3) Build debug queue (evaluates loop counts in current Python env)
            const q = await buildDebugQueue(pyo, plan);
            if (!cancelled) setExecQueue(q);
        })();
        return () => { cancelled = true; };
    }, [nodes, edges, ensurePyodide]);

    const variableNames = useMemo(() => {
        const names = [];
        for (const n of nodes) {
            if (n.type === "variable") {
                for (const v of n.data?.variables || []) {
                    if (v?.name) names.push(v.name);
                }
            }
        }
        return names;
    }, [nodes]);

    const functionDefs = useMemo(() => {
        const list = [];
        for (const n of nodes) {
            if (n.type === "function") {
                const name = n.data?.name || "fn";
                const params = (n.data?.params || [])
                    .filter((p) => p?.name)
                    .map((p) => p.name);
                list.push({ name, params });
            }
        }
        return list;
    }, [nodes]);

    const onNodesChange = useCallback(
        (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
        []
    );
    const onEdgesChange = useCallback(
        (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
        []
    );
    
    const onConnect = useCallback((params) => {
        let label, style;
        if (params.sourceHandle === "body") { label = "Body"; style = { stroke: "#10b981" }; }
        else if (params.sourceHandle === "next") { label = "Next"; style = { stroke: "#3b82f6" }; }
        else if (params.sourceHandle === "true") { label = "True"; style = { stroke: "#10b981" }; }
        else if (params.sourceHandle === "false") { label = "False"; style = { stroke: "#ef4444" }; }

        setEdges((eds) => addEdge({ ...params, animated: true, label, style }, eds));
    }, []);


    // New click handler to open the modal
    const onNodeClick = useCallback((event, node) => {
        setModalNode(node);
        setIsModalOpen(true);
    }, []);

    const handleModalClose = () => {
        setIsModalOpen(false);
        setModalNode(null);
    };

    const handleModalSave = (updatedData) => {
        setNodes((nds) =>
            nds.map((n) =>
                n.id === modalNode.id ? { ...n, data: updatedData } : n
            )
        );
        handleModalClose();
    };

    // The rest of the `WorkflowEditor` functions (`addNode`, `exportPython`, etc.) remain the same.
    const addNode = (type, data = {}, x = 120, y = 80) => {
        const id = nextId();
        setNodes((nds) => nds.concat({ id, type, data, position: { x, y } }));
    };

    const addVariable = () => addNode(
        "variable",
        { label: "Variables", variables: [{ name: "x", type: "int", value: 10 }] },
        80,
        120
    );
    const addFunction = () => addNode(
        "function",
        { label: "My Function", name: "my_fn", params: [{ name: "x", type: "any", default: "" }], body: "print(x)" },
        340,
        120
    );
    const addLoop = () => addNode(
        "loop",
        { label: "Loop", indexVar: "i", count: 5, countVar: "", body: "print(i)" },
        80,
        300
    );
    const addCondition = () => addNode(
        "condition",
        { label: "If block", condition: "x > 0" },
        340,
        300
    );

    const clearAll = () => {
        setNodes([]);
        setEdges([]);
    };

    const exportPython = () => {
        const roots = findRoots(nodes, edges);
        let code = "";
        const visited = new Set();
        if (roots.length) {
            for (const r of roots) code += buildCode(r.id, nodes, edges, visited);
        } else if (nodes.length) {
            const sorted = [...nodes].sort((a, b) => (a.position.x - b.position.x) || (a.position.y - b.position.y));
            code = buildCode(sorted[0].id, nodes, edges);
        }
        downloadText("workflow.py", (code || "").trimEnd());
    };

    const saveJson = () => {
        const payload = JSON.stringify({ nodes, edges }, null, 2);
        downloadText("workflow.json", payload);
    };

    const loadJson = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const { nodes: n, edges: egs } = JSON.parse(e.target.result);
                if (Array.isArray(n) && Array.isArray(egs)) {
                    setNodes(n);
                    setEdges(egs);
                }
            } catch (err) {
                alert("Invalid JSON");
            }
        };
        reader.readAsText(file);
    };

    const findRoots = (nodes, edges) => {
        const incoming = new Map(nodes.map(n => [n.id, 0]));
        for (const e of edges) {
            if (incoming.has(e.target)) incoming.set(e.target, (incoming.get(e.target) || 0) + 1);
        }
        return nodes
            .filter(n => (incoming.get(n.id) || 0) === 0)
            .sort((a, b) => (a.position.x - b.position.x) || (a.position.y - b.position.y));
    };

    const pythonCode = useMemo(() => {
        if (!nodes.length) return "# add blocks to generate code";
        const roots = findRoots(nodes, edges);
        if (!roots.length) {
            // fallback: pick the left-most node(s) as roots
            const sorted = [...nodes].sort((a, b) => (a.position.x - b.position.x) || (a.position.y - b.position.y));
            return buildCode(sorted[0].id, nodes, edges);
        }
        let code = "";
        const visited = new Set();
        for (const r of roots) {
            code += buildCode(r.id, nodes, edges, visited);
        }
        return code.trimEnd() || "# (no code)";
    }, [nodes, edges]);

    // parent component
    const [activeSegIdx, setActiveSegIdx] = useState(null);
    const [activeNodeId, setActiveNodeId] = useState(null);

    const setActiveNode = useCallback((nodeId) => {
        setActiveNodeId(prev => {
            if (prev === nodeId) return prev;
            setNodes(nds => {
                let changed = false;
                const next = nds.map(n => {
                    const nextActive = !!nodeId && n.id === nodeId;
                    const currActive = !!n.data?.__active;
                    if (nextActive !== currActive) {
                        changed = true;
                        return { ...n, data: { ...n.data, __active: nextActive } };
                    }
                    return n;
                });
                return changed ? next : nds;
            });
            return nodeId;
        });
    }, []);





    return (
        <div style={{ display: "flex", height: "100vh", width: "100%" }}>
            <ReactFlowProvider>
                <div style={{ flex: 1, borderRight: "1px solid #e5e7eb", position: "relative" }}>
                    <ReactFlow
                        ref={rf}
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={nodeTypes}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        fitView
                    >
                        <MiniMap pannable zoomable />
                        <Controls />
                        <Background variant="dots" gap={16} size={1} />
                        <Panel position="top-left">
                            <div style={{ display: "flex", gap: 8, background: "#fff", padding: 8, borderRadius: 12, border: "1px solid #e5e7eb" }}>
                                <TBtn onClick={addVariable}>+ Variables</TBtn>
                                <TBtn onClick={addFunction}>+ Function</TBtn>
                                <TBtn onClick={addLoop}>+ Loop</TBtn>
                                <TBtn onClick={addCondition}>+ IF</TBtn>
                                <div style={{ width: 1, background: "#e5e7eb", margin: "0 6px" }} />
                                <TBtn onClick={clearAll}>Clear</TBtn>
                                <TBtn onClick={saveJson}>Save JSON</TBtn>
                                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                    <span style={{ fontSize: 12, padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff" }}>Load JSON</span>
                                    <input type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && loadJson(e.target.files[0])} />
                                </label>
                                <TBtn onClick={exportPython}>Export .py</TBtn>
                            </div>
                        </Panel>
                    </ReactFlow>
                </div>
            </ReactFlowProvider>

            <div style={{ width: 600, display: "grid", gridTemplateRows: "minmax(200px, 1fr) minmax(220px, 1fr)", gap: 12, padding: 12, background: "#fafafa" }}>
                {/* Left column */}
                <div style={{ background: "#0b1021", color: "#a7f3d0", borderRadius: 12, padding: 12, border: "1px solid #0b1021" }}>
                    <div style={{ fontWeight: 700, color: "#86efac", marginBottom: 8 }}>Generated Python</div>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{pythonCode}</pre>
                </div>
                {/* Right column */}
                <Executor
                    queue={execQueue}
                    onStepChange={(i, item) => {
                        setActiveSegIdx(i);
                        setActiveNode(item?.nodeId || null);
                    }}
                    onReset={() => {
                        setActiveSegIdx(null);
                        setActiveNode(null);
                    }}
                />
            </div>

            {modalNode && (
                <Modal isOpen={isModalOpen} onClose={handleModalClose}>
                    <div style={{ fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                        Block Properties for: {modalNode.data.label || modalNode.type}
                    </div>
                    <PropertyEditor
                        node={modalNode}
                        onSave={handleModalSave}
                        variableNames={variableNames}
                        functionDefs={functionDefs}
                        onCreateFunction={addFunction}
                    />
                </Modal>
            )}
        </div>
    );
}