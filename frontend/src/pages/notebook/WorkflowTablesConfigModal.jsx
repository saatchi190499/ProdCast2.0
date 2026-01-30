import React, { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Plus, Trash2, X } from "lucide-react";

function sanitizeTabType(type) {
  return String(type || "").trim();
}

function ensureConfigShape(config, variant) {
  const base = config && typeof config === "object" ? config : {};
  const tabs = Array.isArray(base.tabs) ? base.tabs : [];
  if (variant === "outputs") {
    return {
      mode: base.mode || "append",
      saveTarget: base.saveTarget || "local",
      tabs,
    };
  }
  return { tabs };
}

function ensureTabDefaults(tab, variant) {
  const t = tab && typeof tab === "object" ? tab : {};
  const base = {
    id: t.id,
    type: t.type,
    instances: Array.isArray(t.instances) ? t.instances : [],
    columns: Array.isArray(t.columns) ? t.columns : [],
  };
  if (variant === "inputs") {
    const legacyPreset = (t.dateRange && t.dateRange.preset) || "";
    if (legacyPreset === "last_day") return { ...base, dateRange: { preset: "last_n", value: 1, unit: "day" } };
    if (legacyPreset === "last_week") return { ...base, dateRange: { preset: "last_n", value: 1, unit: "week" } };
    if (legacyPreset === "last_month") return { ...base, dateRange: { preset: "last_n", value: 1, unit: "month" } };
    return {
      ...base,
      dateRange: t.dateRange || { preset: "current" },
    };
  }
  return base;
}

export default function WorkflowTablesConfigModal({
  open,
  title,
  variant, // 'inputs' | 'outputs'
  config,
  setConfig,
  onClose,
  internalComponents,
  objectTypes,
  instancesByType,
  propertyOptions,
}) {
  const normalized = useMemo(() => {
    const shaped = ensureConfigShape(config, variant);
    return {
      ...shaped,
      tabs: (shaped.tabs || []).map((t) => ensureTabDefaults(t, variant)),
    };
  }, [config, variant]);

  const tabs = normalized.tabs;

  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id || "");
  const [showAddTab, setShowAddTab] = useState(false);
  const [newTabType, setNewTabType] = useState("");

  const [instanceFilter, setInstanceFilter] = useState("");

  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [columnComponentId, setColumnComponentId] = useState("");
  const [columnProperty, setColumnProperty] = useState("");
  const [columnLabel, setColumnLabel] = useState("");

  useEffect(() => {
    if (!open) return;
    const first = tabs[0]?.id || "";
    setActiveTabId((prev) => (prev && tabs.some((t) => t.id === prev) ? prev : first));
  }, [open, tabs]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  const availableInstances = useMemo(() => {
    if (!activeTab?.type) return [];
    const list = instancesByType?.[activeTab.type] || [];
    const needle = instanceFilter.trim().toLowerCase();
    const mapped = list.map((i) => i.name);
    if (!needle) return mapped;
    return mapped.filter((n) => String(n).toLowerCase().includes(needle));
  }, [activeTab?.type, instancesByType, instanceFilter]);

  const availableProperties = useMemo(() => {
    if (!activeTab?.type) return [];
    return (propertyOptions?.[activeTab.type] || []).map((p) => p.name);
  }, [activeTab?.type, propertyOptions]);

  const componentOptions = useMemo(() => {
    return (internalComponents || []).map((c) => ({ id: c.id, name: c.name }));
  }, [internalComponents]);

  const applyConfig = (next) => {
    setConfig(ensureConfigShape(next, variant));
  };

  const addTab = () => {
    const type = sanitizeTabType(newTabType);
    if (!type) return;

    const existing = (tabs || []).some((t) => String(t.type || "").trim() === type);
    if (existing) {
      alert(`Tab for type \"${type}\" already exists`);
      return;
    }

    const id = uuidv4();
    const tab = variant === "inputs"
      ? { id, type, instances: [], columns: [], dateRange: { preset: "current" } }
      : { id, type, instances: [], columns: [] };

    applyConfig({
      ...normalized,
      tabs: [...tabs, tab],
    });
    setActiveTabId(id);
    setNewTabType("");
    setShowAddTab(false);
  };

  const removeTab = (tabId) => {
    const nextTabs = tabs.filter((t) => t.id !== tabId);
    applyConfig({ ...normalized, tabs: nextTabs });
    if (activeTabId === tabId) {
      setActiveTabId(nextTabs[0]?.id || "");
    }
  };

  const toggleInstance = (instName) => {
    if (!activeTab) return;
    const current = Array.isArray(activeTab.instances) ? activeTab.instances : [];
    const nextInstances = current.includes(instName)
      ? current.filter((n) => n !== instName)
      : [...current, instName];

    const nextTabs = tabs.map((t) => (t.id === activeTab.id ? { ...t, instances: nextInstances } : t));
    applyConfig({ ...normalized, tabs: nextTabs });
  };

  const setActiveTabDateRange = (patch) => {
    if (!activeTab) return;
    const current = activeTab.dateRange || { preset: "current" };
    const next = { ...current, ...patch };
    const nextTabs = tabs.map((t) => (t.id === activeTab.id ? { ...t, dateRange: next } : t));
    applyConfig({ ...normalized, tabs: nextTabs });
  };

  const openAddColumn = () => {
    if (!activeTab?.type) {
      alert("Select a tab (Type) first");
      return;
    }
    setColumnComponentId(componentOptions[0]?.id ? String(componentOptions[0].id) : "");
    setColumnProperty(availableProperties[0] ? String(availableProperties[0]) : "");
    setColumnLabel(availableProperties[0] ? String(availableProperties[0]) : "");
    setShowColumnPicker(true);
  };

  const addColumn = () => {
    if (!activeTab) return;
    const compId = columnComponentId ? Number(columnComponentId) : null;
    const prop = String(columnProperty || "").trim();
    const label = String(columnLabel || "").trim() || prop;

    if (!compId || !prop) return;

    const existingLabel = (activeTab.columns || []).some((c) => String(c.label || "") === label);
    if (existingLabel) {
      alert(`Column label \"${label}\" already exists in this tab`);
      return;
    }

    const newCol = { id: uuidv4(), componentId: compId, property: prop, label };
    const nextTabs = tabs.map((t) => (
      t.id === activeTab.id
        ? { ...t, columns: [...(t.columns || []), newCol] }
        : t
    ));
    applyConfig({ ...normalized, tabs: nextTabs });
    setShowColumnPicker(false);
  };

  const removeColumn = (colId) => {
    if (!activeTab) return;
    const nextTabs = tabs.map((t) => (
      t.id === activeTab.id
        ? { ...t, columns: (t.columns || []).filter((c) => c.id !== colId) }
        : t
    ));
    applyConfig({ ...normalized, tabs: nextTabs });
  };

  if (!open) return null;

  const dateRange = activeTab?.dateRange || { preset: "current" };
  const isCustomRange = variant === "inputs" && dateRange.preset === "custom";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="ds-card"
        style={{
          background: "var(--bs-body-bg)",
          color: "var(--bs-body-color)",
          padding: 20,
          borderRadius: 12,
          minWidth: 760,
          maxWidth: "90vw",
          maxHeight: "85vh",
          overflowY: "auto",
          display: "grid",
          gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h4 className="ds-heading" style={{ margin: 0 }}>{title}</h4>
            <button className="btn-brand-outline" onClick={() => setShowAddTab(true)}>
              <Plus size={16} /> Add tab
            </button>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {variant === "outputs" && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div>
              <label style={{ fontWeight: 600 }}>Save Target</label>
              <select
                className="form-select"
                value={normalized.saveTarget}
                onChange={(e) => applyConfig({ ...normalized, saveTarget: e.target.value })}
              >
                <option value="local">Local JSON</option>
                <option value="db">Database</option>
              </select>
            </div>
            <div>
              <label style={{ fontWeight: 600 }}>Mode</label>
              <select
                className="form-select"
                value={normalized.mode}
                onChange={(e) => applyConfig({ ...normalized, mode: e.target.value })}
              >
                <option value="append">Append</option>
                <option value="replace">Replace</option>
              </select>
            </div>
          </div>
        )}

        {/* Tabs row */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: t.id === activeTabId ? "2px solid var(--brand)" : "1px solid var(--brand-outline)",
                borderRadius: 999,
                padding: "6px 10px",
              }}
            >
              <button
                className="btn-ghost"
                style={{ padding: 0 }}
                onClick={() => setActiveTabId(t.id)}
                title="Select tab"
              >
                <span style={{ fontWeight: 700 }}>{t.type || "(no type)"}</span>
              </button>
              <button
                className="btn-ghost"
                style={{ padding: 0 }}
                onClick={() => removeTab(t.id)}
                title="Remove tab"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {tabs.length === 0 && (
            <div style={{ opacity: 0.75 }}>No tabs yet. Click “Add tab”.</div>
          )}
        </div>

        {activeTab && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
            {/* Left: Instances + Date range */}
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ border: "1px solid var(--brand-outline)", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>Instances</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ opacity: 0.7 }}>Type:</span>
                    <select
                      className="form-select"
                      style={{ minWidth: 200 }}
                      value={activeTab.type || ""}
                      onChange={(e) => {
                        const type = sanitizeTabType(e.target.value);
                        const nextTabs = tabs.map((t) => (
                          t.id === activeTab.id
                            ? { ...t, type, instances: [], columns: [], ...(variant === 'inputs' ? { dateRange: { preset: 'current' } } : {}) }
                            : t
                        ));
                        applyConfig({ ...normalized, tabs: nextTabs });
                      }}
                    >
                      <option value="">Select type...</option>
                      {(objectTypes || []).map((t) => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <input
                  className="form-control"
                  placeholder="Filter instances..."
                  value={instanceFilter}
                  onChange={(e) => setInstanceFilter(e.target.value)}
                  disabled={!activeTab.type}
                  style={{ marginBottom: 10 }}
                />

                {!activeTab.type && (
                  <div style={{ opacity: 0.75 }}>Pick a Type to load instances.</div>
                )}

                {activeTab.type && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 6 }}>
                    {availableInstances.map((name) => (
                      <label key={name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={(activeTab.instances || []).includes(name)}
                          onChange={() => toggleInstance(name)}
                        />
                        <span>{name}</span>
                      </label>
                    ))}
                    {availableInstances.length === 0 && (
                      <div style={{ opacity: 0.75 }}>No instances found.</div>
                    )}
                  </div>
                )}
              </div>

              {variant === "inputs" && (
                <div style={{ border: "1px solid var(--brand-outline)", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Date Range</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <div>
                      <label style={{ fontWeight: 600 }}>Preset</label>
                      <select
                        className="form-select"
                        value={dateRange.preset || "current"}
                        onChange={(e) => {
                        const preset = e.target.value;
                        if (preset === "last_n") {
                          setActiveTabDateRange({ preset, value: dateRange.value ?? 1, unit: dateRange.unit || "week" });
                        } else {
                          setActiveTabDateRange({ preset });
                        }
                      }}
                      >
                        <option value="current">Current (latest)</option>
<option value="last_n">Last N (day/week/month)</option>
<option value="custom">Custom</option>
                      </select>
                    </div>

                    {dateRange.preset === "last_n" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontWeight: 600 }}>Count</label>
                          <input
                            type="number"
                            min={1}
                            className="form-control"
                            value={dateRange.value ?? 1}
                            onChange={(e) => setActiveTabDateRange({ value: Number(e.target.value || 1) })}
                          />
                        </div>
                        <div>
                          <label style={{ fontWeight: 600 }}>Unit</label>
                          <select
                            className="form-select"
                            value={dateRange.unit || "week"}
                            onChange={(e) => setActiveTabDateRange({ unit: e.target.value })}
                          >
                            <option value="day">Day(s)</option>
                            <option value="week">Week(s)</option>
                            <option value="month">Month(s)</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {isCustomRange && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontWeight: 600 }}>Start</label>
                          <input
                            type="datetime-local"
                            className="form-control"
                            value={dateRange.start || ""}
                            onChange={(e) => setActiveTabDateRange({ start: e.target.value })}
                          />
                        </div>
                        <div>
                          <label style={{ fontWeight: 600 }}>End</label>
                          <input
                            type="datetime-local"
                            className="form-control"
                            value={dateRange.end || ""}
                            onChange={(e) => setActiveTabDateRange({ end: e.target.value })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Columns */}
            <div style={{ border: "1px solid var(--brand-outline)", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>Columns</div>
                <button className="btn-brand" onClick={openAddColumn} disabled={!activeTab.type}>
                  <Plus size={16} /> Add column
                </button>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {(activeTab.columns || []).map((c) => {
                  const compName = (componentOptions.find((x) => x.id === c.componentId)?.name) || String(c.componentId);
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        border: "1px solid var(--brand-outline)",
                        borderRadius: 10,
                        padding: 10,
                      }}
                    >
                      <div style={{ display: "grid", gap: 2 }}>
                        <div style={{ fontWeight: 700 }}>{c.label}</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          Component: {compName} · Property: {c.property}
                        </div>
                      </div>
                      <button className="btn-danger-outline" onClick={() => removeColumn(c.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}

                {(activeTab.columns || []).length === 0 && (
                  <div style={{ opacity: 0.75 }}>No columns yet. Click “Add column”.</div>
                )}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn-brand-outline" onClick={onClose}>Close</button>
        </div>

        {/* Add tab popup */}
        {showAddTab && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1100,
            }}
            onClick={() => setShowAddTab(false)}
          >
            <div
              className="ds-card"
              style={{
                background: "var(--bs-body-bg)",
                color: "var(--bs-body-color)",
                padding: 16,
                borderRadius: 12,
                minWidth: 420,
                display: "grid",
                gap: 10,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 800 }}>Add tab</div>
                <button className="btn-ghost" onClick={() => setShowAddTab(false)}><X size={16} /></button>
              </div>

              <div>
                <label style={{ fontWeight: 600 }}>Type</label>
                <select
                  className="form-select"
                  value={newTabType}
                  onChange={(e) => setNewTabType(e.target.value)}
                >
                  <option value="">Select type...</option>
                  {(objectTypes || []).map((t) => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn-brand-outline" onClick={() => setShowAddTab(false)}>Cancel</button>
                <button className="btn-brand" onClick={addTab} disabled={!newTabType}>Add</button>
              </div>
            </div>
          </div>
        )}

        {/* Add column popup */}
        {showColumnPicker && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1100,
            }}
            onClick={() => setShowColumnPicker(false)}
          >
            <div
              className="ds-card"
              style={{
                background: "var(--bs-body-bg)",
                color: "var(--bs-body-color)",
                padding: 16,
                borderRadius: 12,
                minWidth: 520,
                display: "grid",
                gap: 10,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 800 }}>Add column</div>
                <button className="btn-ghost" onClick={() => setShowColumnPicker(false)}><X size={16} /></button>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <label style={{ fontWeight: 600 }}>Component</label>
                  <select
                    className="form-select"
                    value={columnComponentId}
                    onChange={(e) => setColumnComponentId(e.target.value)}
                  >
                    {componentOptions.map((c) => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontWeight: 600 }}>Property</label>
                  <select
                    className="form-select"
                    value={columnProperty}
                    onChange={(e) => {
                      setColumnProperty(e.target.value);
                      setColumnLabel(e.target.value);
                    }}
                  >
                    {availableProperties.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  {availableProperties.length === 0 && (
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                      No properties for this Type.
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ fontWeight: 600 }}>Column label</label>
                  <input
                    className="form-control"
                    value={columnLabel}
                    onChange={(e) => setColumnLabel(e.target.value)}
                    placeholder="Gas Rate"
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn-brand-outline" onClick={() => setShowColumnPicker(false)}>Cancel</button>
                <button
                  className="btn-brand"
                  onClick={addColumn}
                  disabled={!columnComponentId || !columnProperty}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
