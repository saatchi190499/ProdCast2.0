// src/pages/processes/ui/CodeEditor.jsx
import Editor from "@monaco-editor/react";

export default function CodeEditor({ value, onChange, height = "200px" }) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
      <Editor
        height={height}
        language="python"
        value={value}
        onChange={(val) => onChange(val || "")}
        theme="vs-dark"
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
        }}
      />
    </div>
  );
}
