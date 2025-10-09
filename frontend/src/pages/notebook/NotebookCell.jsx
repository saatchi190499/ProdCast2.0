import Editor from "@monaco-editor/react";
import { useTheme } from "../../context/ThemeContext";
import { CheckCircle2, XCircle, Terminal, Loader2 } from "lucide-react";

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
          {output.loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--brand)" }}>
              <Loader2 size={18} className="spin" style={{ animation: "spin 1s linear infinite" }} /> Running…
            </div>
          ) : output.stderr ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "var(--bs-danger-text)",
                fontWeight: 500,
              }}
            >
              <XCircle size={18} /> {output.stderr}
            </div>
          ) : output.stdout ? (
            <pre
              style={{
                background: mode === "dark" ? "#111" : "#f9fafb",
                color: mode === "dark" ? "#0f0" : "#065f46",
                padding: 6,
                borderRadius: 6,
                display: "flex",
                alignItems: "flex-start",
                gap: 6,
              }}
            >
              <Terminal size={16} style={{ marginTop: 2 }} />
              {output.stdout}
            </pre>
          ) : (
            <CheckCircle2 size={18} style={{ color: "var(--brand-800)" }} />
          )}
        </div>
      )}
    </div>
  );
}
