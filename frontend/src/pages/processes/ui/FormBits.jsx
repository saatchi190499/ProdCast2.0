import Tooltip from "./Tooltip";

export const Row = ({ children, gap = 8, style = {} }) => (
  <div style={{ display: "flex", gap, alignItems: "center", ...style }}>{children}</div>
);

export const LabelInput = ({ label, tooltip, ...props }) => (
  <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
    <span style={{ fontWeight: 600, display: "flex", gap: 6 }}>
      {label} {tooltip && <Tooltip text={tooltip} />}
    </span>
    <input {...props} style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 12 }} />
  </label>
);

export const LabelSelect = ({ label, options, value, onChange, tooltip }) => (
  <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
    <span style={{ fontWeight: 600, display: "flex", gap: 6 }}>
      {label} {tooltip && <Tooltip text={tooltip} />}
    </span>
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 12 }}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </label>
);

export const TextArea = ({ label, rows = 6, tooltip, ...props }) => (
  <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
    <span style={{ fontWeight: 600, display: "flex", gap: 6 }}>
      {label} {tooltip && <Tooltip text={tooltip} />}
    </span>
    <textarea rows={rows} {...props} style={{
      padding: 8, border: "1px solid #d1d5db", borderRadius: 8,
      fontFamily: "ui-monospace, monospace", fontSize: 12
    }} />
  </label>
);
