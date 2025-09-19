import { Handle, Position } from "reactflow";
import Card from "../ui/Card";

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

export default FunctionNode;
