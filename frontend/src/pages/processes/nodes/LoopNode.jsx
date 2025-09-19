import { Handle, Position } from "reactflow";
import Card from "../ui/Card";

const LoopNode = ({ data }) => {
  const loopIndex = data.indexVar || "i";
  const loopCount = data.countVar && String(data.countVar).trim() !== "" ? data.countVar : (data.count ?? 5);

  return (
    <div>
      <Handle type="target" position={Position.Left} title="Input flow" />
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

export default LoopNode;
