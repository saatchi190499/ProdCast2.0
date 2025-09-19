import { Handle, Position } from "reactflow";
import Card from "../ui/Card";

const ConditionNode = ({ data }) => (
  <div>
    <Handle type="target" position={Position.Left} title="Input flow" />
    <Handle id="true" type="source" position={Position.Right} style={{ top: 20, background: "#10b981" }} title="TRUE branch" />
    <Handle id="false" type="source" position={Position.Right} style={{ top: 60, background: "#ef4444" }} title="FALSE branch" />
    <Card title={data.label || "Condition"} color="#ef4444" active={!!data.__active}>
      <div>if {data.condition || "True"}</div>
      <div style={{ color: "#10b981", fontSize: 11 }}>true ➜ connect from green handle</div>
      <div style={{ color: "#ef4444", fontSize: 11 }}>false ➜ connect from red handle</div>
    </Card>
  </div>
);

export default ConditionNode;
