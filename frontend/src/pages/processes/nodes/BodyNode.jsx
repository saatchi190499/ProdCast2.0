import { Handle, Position } from "reactflow";
import Card from "../ui/Card";

export default function BodyNode({ data }) {
  return (
    <div>
      <Handle type="target" position={Position.Left} title="Input flow" />
      <Card title={data.label || "Body"} color="#8b5cf6" active={!!data.__active}>
        <div style={{ whiteSpace: "pre-wrap" }}>
          {data.body || "pass"}
        </div>
      </Card>
      <Handle type="source" position={Position.Right} title="Output flow" />
    </div>
  );
}
