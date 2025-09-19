export const nextId = (() => { let i = 1; return () => String(i++); })();

export const nl = (s = "") => {
  const str = String(s).trimEnd();
  return str.endsWith("\n") ? str : str + "\n";
};

export const indent = (s, n = 1) =>
  (s || "pass").split("\n").map(line => "    ".repeat(n) + line).join("\n");

export const downloadText = (filename, text) => {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const TYPE_OPTIONS = ["int", "float", "str", "bool", "any"];

export const stringifyByType = (val, type) => {
  if (type === "int") return String(parseInt(val ?? 0, 10));
  if (type === "float") return String(parseFloat(val ?? 0));
  if (type === "bool") return String(val === true || val === "true").toLowerCase();
  if (type === "str") return JSON.stringify(String(val ?? ""));
  if (val === "true" || val === true) return "true";
  if (val === "false" || val === false) return "false";
  const n = Number(val);
  if (!Number.isNaN(n) && val !== "") return String(n);
  return JSON.stringify(String(val ?? ""));
};
