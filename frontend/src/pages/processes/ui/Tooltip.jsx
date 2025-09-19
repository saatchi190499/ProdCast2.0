const Tooltip = ({ text }) => (
  <span style={{ position: "relative", display: "inline-flex" }}>
    <span title={text} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 16, height: 16, borderRadius: 999, fontSize: 11,
      background: "#eef2ff", color: "#3730a3", cursor: "help", userSelect: "none"
    }}>i</span>
  </span>
);
export default Tooltip;
