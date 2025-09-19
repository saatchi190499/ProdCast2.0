import { Handle, Position } from "reactflow";
import Card from "../ui/Card";

const VariableNode = ({ data }) => {
  const rows = (data.variables || []).map((v) => {
    const t = v.source?.type || "literal";
    if (t === "call" && v.source?.fn) {
      const argStr = (v.source.args || [])
        .map(a => a?.useVar ? (a.varName || "") : a.value)
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
              <th style={{ textAlign: "left" }}>name</th>
              <th style={{ textAlign: "left" }}>type</th>
              <th style={{ textAlign: "left" }}>value</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r, idx) => (
                <tr key={idx}>
                  <td>{r.name}</td>
                  <td>{r.type}</td>
                  <td>{r.value}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={3} style={{ color: "#9ca3af" }}>no variables</td></tr>
            )}
          </tbody>
        </table>
      </Card>
      <Handle type="source" position={Position.Right} title="Output flow" />
    </div>
  );
};

export default VariableNode;
