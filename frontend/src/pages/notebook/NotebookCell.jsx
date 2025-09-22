import Editor from "@monaco-editor/react";

export default function NotebookCell({ cell, onChange, output }) {
    return (
        <div style={{ marginBottom: 8 }}>
            <Editor
                height="200px"
                defaultLanguage="python"
                value={cell.source || ""}
                onChange={(val) => onChange({ ...cell, source: val })}
                options={{ fontSize: 14, minimap: { enabled: false }, wordWrap: "on" }}
            />

            {output && (
                <div style={{ marginTop: 6 }}>
                    {output.stderr ? (
                        <div style={{ color: "red", fontWeight: 500 }}>
                            ❌ {output.stderr}
                        </div>
                    ) : output.stdout ? (
                        <pre style={{ background: "#111", color: "#0f0", padding: 6 }}>
                            {output.stdout}
                        </pre>
                    ) : (
                        <span style={{ color: "green", fontWeight: 500 }}>✔️</span>
                    )}
                </div>
            )}

        </div>
    );
}
