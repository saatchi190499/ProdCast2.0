const Modal = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: "#fff", padding: 20, borderRadius: 12,
        minWidth: 400, maxWidth: 600, maxHeight: "80vh", overflowY: "auto",
        position: "relative", display: "grid", gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: "absolute", top: 10, right: 10,
          background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>
          &times;
        </button>
        {children}
      </div>
    </div>
  );
};
export default Modal;
