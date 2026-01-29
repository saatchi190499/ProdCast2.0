import Editor from "@monaco-editor/react";
import { useTheme } from "../../context/ThemeContext";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Terminal, Loader2 } from "lucide-react";

export default function NotebookCell({ cell, onChange, output, onFocus }) {
  const { mode } = useTheme();
  const editorRef = useRef(null);
  const [height, setHeight] = useState(200);

  const handleMount = (editor, monaco) => {
    editorRef.current = editor;

    const updateSize = () => {
      try {
        const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
        const lineCount = editor.getModel()?.getLineCount?.() || 1;
        const paddingOpt = editor.getOption(monaco.editor.EditorOption.padding);
        const paddingTop = paddingOpt?.top ?? 8;
        const paddingBottom = paddingOpt?.bottom ?? 8;
        const contentHeight = lineCount * lineHeight + paddingTop + paddingBottom;
        const newHeight = Math.max(120, contentHeight + 4);
        setHeight(newHeight);
        editor.layout();
      } catch {}
    };

    updateSize();
    const d1 = editor.onDidContentSizeChange(updateSize);
    const d2 = editor.onDidChangeModelContent((e) => {
      updateSize();
      try {
        const inserted = (e.changes || []).map((c) => c.text).join("");
        if (inserted && (inserted.includes(".") || inserted.includes(","))) {
          editor.trigger("keyboard", "editor.action.triggerSuggest", {});
        }
      } catch {}
    });
    const d3 = editor.onDidFocusEditorText?.(() => onFocus && onFocus());
    const d4 = editor.onDidFocusEditorWidget?.(() => onFocus && onFocus());

    return () => {
      d1?.dispose?.();
      d2?.dispose?.();
      d3?.dispose?.();
      d4?.dispose?.();
    };
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <Editor
        height={height}
        defaultLanguage="python"
        value={cell.source || ""}
        onChange={(val) => onChange({ ...cell, source: val })}
        onMount={handleMount}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          wordWrap: "on",
          automaticLayout: true,
          scrollBeyondLastLine: false,
          scrollbar: { vertical: "hidden" },
          fixedOverflowWidgets: true,
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
