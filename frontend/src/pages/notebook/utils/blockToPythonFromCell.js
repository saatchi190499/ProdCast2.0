export function blockToPythonFromCell(cell) {
  switch (cell.type) {
    case "variable":
      if (!cell.metadata?.variables) return "";
      return cell.metadata.variables
        .map((v) => {
          const name = v.name || "var";
          let value;
          if (v.type === "var" || v.type === "func") {
            value = v.value || "None"; // assign by reference
          } else if (v.type === "int") {
            value = parseInt(v.value || 0, 10);
          } else if (v.type === "float") {
            value = parseFloat(v.value || 0);
          } else if (v.type === "bool") {
            value = v.value === "true" || v.value === true ? "True" : "False";
          } else if (v.type === "str") {
            let safe = String(v.value).replace(/\\/g, "/");
            if (safe.startsWith('"') && safe.endsWith('"')) {
              safe = safe.slice(1, -1);
            }
            value = `"${safe}"`;
          } else {
            value = JSON.stringify(v.value);
          }
          return `${name} = ${value}`;
        })
        .join("\n");

    case "function":
      if (!cell.metadata) return "";
      const name = cell.metadata.name || "my_func";
      const params = (cell.metadata.params || [])
        .map((p) => {
          if (p.default !== undefined && p.default !== "") {
            // sanitize string defaults
            let val = p.default;
            if (p.type === "str") val = `"${String(val).replace(/\\/g, "/")}"`;
            return `${p.name}=${val}`;
          }
          return p.name;
        })
        .join(", ");
      const body = cell.metadata.body || "pass";
      const indented = body
        .split("\n")
        .map((line) => "    " + line)
        .join("\n");
      return `def ${name}(${params}):\n${indented}`;

    case "loop":
      const idx = cell.metadata.indexVar || "i";
      const count = cell.metadata.count || 5;
      const loopBody = (cell.metadata.body || "pass")
        .split("\n")
        .map((line) => "    " + line)
        .join("\n");
      return `for ${idx} in range(${count}):\n${loopBody}`;

    case "condition":
      const cond = cell.metadata.condition || "True";
      return `if ${cond}:\n    print("Condition met")\nelse:\n    print("Condition not met")`;

    case "code":
    default:
      return cell.source || "";
  }
}
