import { indent, nl, stringifyByType } from "./helpers";

export const blockToPython = (node) => {
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
            return `for ${idx} in range(${countExpr}):\n${indent(d.body || "pass", 1)}`;
        }
        case "condition":
            return `if ${d.condition || "True"}:\n    pass\nelse:\n    pass`;
        case "body": {
            const body = (d.body || "").trimEnd();
            return body ? body + "\n" : "pass\n";
        }
        default:
            return "# Unknown block";

    }
};

// ========= Рекурсивная генерация кода по графу =========

export function buildCode(nodeId, nodes, edges, visited = new Set(), indentLevel = 0) {
    if (!nodeId || visited.has(nodeId)) return "";
    visited.add(nodeId);

    const byId = new Map(nodes.map(n => [n.id, n]));
    const node = byId.get(nodeId);
    if (!node) return "";

    const outEdges = edges.filter(e => e.source === node.id);
    const seqEdges = outEdges.filter(e => !e.sourceHandle);

    // ---- Loop ----
    if (node.type === "loop") {
        const d = node.data || {};
        const countExpr = d.countVar && String(d.countVar).trim() !== "" ? d.countVar : (d.count ?? 5);
        const idx = d.indexVar || "i";
        let code = indent(`for ${idx} in range(${countExpr}):`, indentLevel) + "\n";

        const bodyEdges = outEdges.filter(e => e.sourceHandle === "body" || e.sourceHandle == null);
        const nextEdges = outEdges.filter(e => e.sourceHandle === "next");

        if (d.body) code += indent(d.body.trimEnd(), indentLevel + 1) + "\n";
        else if (!bodyEdges.length) code += indent("pass", indentLevel + 1) + "\n";

        for (const e of bodyEdges) code += buildCode(e.target, nodes, edges, visited, indentLevel + 1);
        for (const e of nextEdges) code += buildCode(e.target, nodes, edges, visited, indentLevel);

        return code;
    }
    // ---- Body ----
    if (node.type === "body") {
        let code = "";
        if (node.data?.body) {
            code += indent(node.data.body.trimEnd(), indentLevel) + "\n";
        } else {
            code += indent("pass", indentLevel) + "\n";
        }

        // рекурсивные дети
        const seqEdges = edges.filter(e => e.source === node.id && !e.sourceHandle);
        for (const e of seqEdges) {
            code += buildCode(e.target, nodes, edges, visited, indentLevel);
        }
        return code;
    }

    // ---- Condition ----
    if (node.type === "condition") {
        const d = node.data || {};
        let code = indent(`if ${d.condition || "True"}:`, indentLevel) + "\n";

        const trueEdges = outEdges.filter(e => e.sourceHandle === "true");
        const falseEdges = outEdges.filter(e => e.sourceHandle === "false");

        if (trueEdges.length) {
            for (const e of trueEdges) code += buildCode(e.target, nodes, edges, visited, indentLevel + 1);
        } else {
            code += indent("pass", indentLevel + 1) + "\n";
        }

        code += indent("else:", indentLevel) + "\n";

        if (falseEdges.length) {
            for (const e of falseEdges) code += buildCode(e.target, nodes, edges, visited, indentLevel + 1);
        } else {
            code += indent("pass", indentLevel + 1) + "\n";
        }

        return code;
    }

    // ---- Variable / Function / etc. ----
    let code = indent((blockToPython(node) || "").trimEnd(), indentLevel) + "\n";
    for (const e of seqEdges) {
        code += buildCode(e.target, nodes, edges, visited, indentLevel);
    }
    return code;
}
