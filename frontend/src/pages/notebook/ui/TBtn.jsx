const TBtn = ({ onClick, children }) => (
  <button onClick={onClick} style={{
    padding: "6px 10px", fontSize: 12, border: "1px solid #e5e7eb",
    borderRadius: 8, background: "#fff", cursor: "pointer"
  }}>
    {children}
  </button>
);
export default TBtn;
