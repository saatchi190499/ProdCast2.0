import { nl } from "./helpers";
import { blockToPython } from "./codegen";

export const makePlan = (nodes = [], edges = []) => {
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

    // сортируем детей по позиции, чтобы был стабильный порядок
    const sortPos = (a, b) =>
        (a.position.x - b.position.x) || (a.position.y - b.position.y);

    for (const [k, arr] of out) {
        arr.sort((ea, eb) => sortPos(byId.get(ea.target), byId.get(eb.target)));
    }

    // только реально связанные ноды
    const connectedIds = new Set();
    for (const e of edges) {
        connectedIds.add(e.source);
        connectedIds.add(e.target);
    }

    // корни
    let roots = nodes
        .filter(n => (inDeg.get(n.id) || 0) === 0 && connectedIds.has(n.id))
        .sort(sortPos);

    if (roots.length === 0 && nodes.length > 0) {
        // fallback: берём просто самую левую верхнюю ноду
        roots = [...nodes].sort(sortPos).slice(0, 1);
    }

    // рекурсивный обход
    const visit = (id) => {
        const n = byId.get(id);
        if (!n) return null;

        if (n.type === "loop") {
            const edgesFrom = out.get(id) || [];
            const bodyEdges = edgesFrom.filter(e => e.sourceHandle === "body" || !e.sourceHandle);
            const nextEdges = edgesFrom.filter(e => e.sourceHandle === "next");

            return {
                kind: "loop",
                nodeId: id,
                indexVar: (n.data?.indexVar || "i"),
                countExpr:
                    (n.data?.countVar && String(n.data.countVar).trim() !== "")
                        ? n.data.countVar
                        : (n.data?.count ?? 5),
                preBody: (n.data?.body ? n.data.body : ""),
                body: bodyEdges.map(e => visit(e.target)).filter(Boolean),
                next: nextEdges.map(e => visit(e.target)).filter(Boolean),
            };
        }

        if (n.type === "condition") {
            const edgesFrom = out.get(id) || [];
            const trueKids = edgesFrom.filter(e => e.sourceHandle === "true").map(e => visit(e.target)).filter(Boolean);
            const falseKids = edgesFrom.filter(e => e.sourceHandle === "false").map(e => visit(e.target)).filter(Boolean);
            const nextKids = edgesFrom.filter(e => !e.sourceHandle).map(e => visit(e.target)).filter(Boolean);

            return {
                kind: "condition",
                nodeId: id,
                condition: (n.data?.condition || "True"),
                trueKids,
                falseKids,
                next: nextKids,
            };
        }

        if (n.type === "body") {
            const edgesFrom = out.get(id) || [];
            return {
                kind: "body",
                nodeId: id,
                body: n.data?.body || "",
                children: edgesFrom.map(e => visit(e.target)).filter(Boolean),
            };
        }

        // по умолчанию — обычный блок
        const children = (out.get(id) || []).map(e => visit(e.target)).filter(Boolean);
        return { kind: "plain", nodeId: id, code: blockToPython(n), children };
    };

    return roots.map(r => visit(r.id)).filter(Boolean);
};


export const buildDebugQueue = async (pyodide, plan, nodes) => {
    const q = [];

    const pushExec = (nodeId, text) => {
        const node = nodes.find((n) => n.id === nodeId);
        const label = node?.data?.label || node?.type || nodeId;
        q.push({ type: "exec", nodeId, label, text: nl(text) });
    };

    const runNodeList = async (nodes) => {
        for (const n of nodes) {
            await runNode(n);
        }
    };

    const renderPlain = (node) =>
        node.code.endsWith("\n") ? node.code : node.code + "\n";

    const runNode = async (node) => {
        if (!node) return;

        if (node.kind === "plain") {
            pushExec(node.nodeId, renderPlain(node));
            await runNodeList(node.children || []);
            return;
        }

        if (node.kind === "body") {
            pushExec(
                node.nodeId,
                node.body && node.body.trim() ? node.body + "\n" : "pass\n"
            );
            await runNodeList(node.children || []);
            return;
        }

        if (node.kind === "condition") {
            let condVal = false;
            try {
                const result = await pyodide.runPythonAsync(node.condition);
                condVal = Boolean(result);
            } catch (e) {
                condVal = false;
            }

            if (condVal) {
                await runNodeList(node.trueKids || []);
            } else {
                await runNodeList(node.falseKids || []);
            }

            // после условия идём дальше
            await runNodeList(node.next || []);
            return;
        }

        if (node.kind === "loop") {
            let countVal = 0;
            try {
                countVal = await pyodide.runPythonAsync(String(node.countExpr));
                countVal = Number.isFinite(Number(countVal))
                    ? Math.trunc(Number(countVal))
                    : 0;
            } catch {
                countVal = 0;
            }
            countVal = Math.max(0, countVal);

            for (let k = 0; k < countVal; k++) {
                pushExec(node.nodeId, `${node.indexVar} = ${k}`);

                if (node.preBody && node.preBody.trim()) {
                    pushExec(node.nodeId, nl(node.preBody.trimEnd()));
                }

                await runNodeList(node.body || []);
            }

            await runNodeList(node.next || []);
            return;
        }
    };

    await runNodeList(plan);
    return q;
};
