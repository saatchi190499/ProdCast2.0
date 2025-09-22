const Card = ({ title, children, color = "#2563eb", active = false }) => (
  <div style={{
    minWidth: 240, background: "#fff", border: `1px solid ${active ? color : `${color}22`}`,
    borderRadius: 12, boxShadow: active ? `0 0 0 3px ${color}33, 0 8px 20px rgba(0,0,0,.10)`
    : "0 4px 14px rgba(0,0,0,.06)", padding: 12
  }}>
    <div style={{ fontWeight: 700, marginBottom: 6, color }}>{title}</div>
    <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>{children}</div>
  </div>
);
export default Card;
