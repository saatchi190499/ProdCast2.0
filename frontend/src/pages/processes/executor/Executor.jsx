import React, { useState, useRef, useCallback, useEffect } from "react";
import { loadPyodideOnce } from "../utils/pyodide";
import TBtn from "../ui/TBtn";

export default function Executor({ queue = [], onStepChange, onReset }) {
  const [status, setStatus] = useState("idle");
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");
  const [idx, setIdx] = useState(0);
  const pyoRef = useRef(null);

  const ensureInit = useCallback(async () => {
    let pyo = pyoRef.current;
    if (!pyo) {
      setStatus("loading");
      pyo = await loadPyodideOnce(setStatus);
      pyoRef.current = pyo;
    }

    // Настраиваем stdout/stderr
    if (pyo.setStdout) {
      pyo.setStdout({
        batched: (s) => setOut((p) => p + s),   // собирает чанки
        line: (s) => setOut((p) => p + s + "\n") // построчный вывод
      });
    }
    if (pyo.setStderr) {
      pyo.setStderr({
        batched: (s) => setErr((p) => p + s),
        line: (s) => setErr((p) => p + s + "\n")
      });
    }

    setStatus("ready");
    return pyo;
  }, []);


  const init = useCallback(async () => { await ensureInit(); }, [ensureInit]);

  const reset = useCallback(() => {
    setOut("");
    setErr("");
    setIdx(0);
    onReset && onReset();
  }, [onReset]);

  const step = useCallback(async () => {
    const pyo = await ensureInit();
    if (!queue?.length || idx >= queue.length) return;
    setStatus("running");
    const item = queue[idx];
    try {
      onStepChange && onStepChange(idx, item);

      if (item.type === "exec" && item.text) {
        // заголовок
        setOut((p) => p + `[${item.label}] >>>\n`);

        // запускаем код
        let result = "";
        try {
          result = await pyo.runPythonAsync(item.text);
        } catch (e) {
          setErr((prev) => prev + String(e) + "\n");
        }

        if (result !== undefined) {
          setOut((p) => p + String(result) + "\n");
        }
      }

      setIdx((i) => i + 1);
    } catch (e) {
      setErr((prev) => prev + String(e) + "\n");
    } finally {
      setStatus("ready");
    }
  }, [idx, queue, ensureInit, onStepChange]);


  const runAll = useCallback(async () => {
    const pyo = await ensureInit();
    setStatus("running");
    try {
      for (let i = idx; i < (queue?.length || 0); i++) {
        const item = queue[i];
        onStepChange && onStepChange(i, item);
        if (item.type === "exec" && item.text != null) {
          let code = String(item.text);
          if (!code.endsWith("\n")) code += "\n";

          setOut((prev) => prev + `\n[${item.label}] >>>\n`);
          await pyo.runPythonAsync(code);
        }

        setIdx(i + 1);
      }
    } catch (e) {
      setErr((prev) => prev + String(e) + "\n");
    } finally {
      setStatus("ready");
    }
  }, [idx, queue, ensureInit, onStepChange]);

  // reset when queue changes
  const prevHashRef = useRef("");
  useEffect(() => {
    const hash = !queue ? "0" : queue.map(q => q.nodeId + ":" + (q.text || "")).join("|");
    if (hash !== prevHashRef.current) {
      prevHashRef.current = hash;
      reset();
    }
  }, [queue, reset]);

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <TBtn onClick={init}>Init</TBtn>
        <TBtn onClick={step}>Step ▶</TBtn>
        <TBtn onClick={runAll}>Run All ⏭</TBtn>
        <TBtn onClick={reset}>Reset ⟲</TBtn>
      </div>
      <div>
        <div style={{ fontWeight: 700 }}>Stdout</div>
        <pre style={{ background: "#0b1021", color: "#e5e7eb", minHeight: 120, padding: 8 }}>{out || "(no output yet)"}</pre>
      </div>
      <div>
        <div style={{ fontWeight: 700 }}>Stderr</div>
        <pre style={{ background: "#1f2937", color: "#fecaca", minHeight: 80, padding: 8 }}>{err || "(no errors)"}</pre>
      </div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>Steps: {queue?.length ?? 0} • Next index: {idx + 1}</div>
    </div>
  );
}
