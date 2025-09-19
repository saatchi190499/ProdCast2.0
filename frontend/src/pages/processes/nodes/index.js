import VariableNode from "./VariableNode";
import FunctionNode from "./FunctionNode";
import LoopNode from "./LoopNode";
import ConditionNode from "./ConditionNode";
import BodyNode from "./BodyNode";

export const nodeTypes = {
    variable: VariableNode,
    function: FunctionNode,
    loop: LoopNode,
    condition: ConditionNode,
    body: BodyNode,

};
