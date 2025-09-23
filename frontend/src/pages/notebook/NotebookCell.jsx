import Editor from "@monaco-editor/react";
import { useTheme } from "../../context/ThemeContext";

export default function NotebookCell({ cell, onChange, output }) {
  const { mode } = useTheme();

  return (
    <div style={{ marginBottom: 8 }}>
      <Editor
        height="200px"
        defaultLanguage="python"
        value={cell.source || ""}
        onChange={(val) => onChange({ ...cell, source: val })}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          wordWrap: "on",
        }}
        theme={mode === "dark" ? "vs-dark" : "light"}
      />

      {output && (
        <div style={{ marginTop: 6 }}>
          {output.stderr ? (
            <div style={{ color: "red", fontWeight: 500 }}>
              ❌ {output.stderr}
            </div>
          ) : output.stdout ? (
            <pre
              style={{
                background: mode === "dark" ? "#111" : "#f9fafb",
                color: mode === "dark" ? "#0f0" : "#065f46",
                padding: 6,
                borderRadius: 6,
              }}
            >
              {output.stdout}
            </pre>
          ) : (
            <span
              style={{
                color: mode === "dark" ? "var(--brand)" : "green",
                fontWeight: 500,
              }}
            >
              ✔️
            </span>
          )}
        </div>
      )}
    </div>
  );
}
