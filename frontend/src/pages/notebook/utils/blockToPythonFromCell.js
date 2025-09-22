export function blockToPythonFromCell(cell) {
  switch (cell.type) {
    case "variable":
      if (!cell.metadata?.variables) return "";
      return cell.metadata.variables
        .map((v) => {
          const name = v.name || "var";
          let value = v.value || "None";

          // 🔹 normalize types
          if (v.type === "int") {
            value = parseInt(value, 10);
          } else if (v.type === "float") {
            value = parseFloat(value);
          } else if (v.type === "bool") {
            value = value === "true" || value === true ? "True" : "False";
          } else if (v.type === "str") {
            // ensure it's a raw string, no duplicate quotes
            let safe = String(v.value).replace(/\\/g, "/"); // fix backslashes
            if (safe.startsWith('"') && safe.endsWith('"')) {
              safe = safe.slice(1, -1); // remove user-provided quotes
            }
            value = `"${safe}"`;
          } else {
            // fallback: stringify
            value = JSON.stringify(value);
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
