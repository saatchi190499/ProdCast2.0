import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../utils/axiosInstance";
import { Card, Button, Form, Spinner, Alert } from "react-bootstrap";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  TimeScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import "chartjs-adapter-date-fns";
import "../DataSourcePage.css";

ChartJS.register(TimeScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const COLORS = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
];

export default function VisualAnalysisBuilder() {
  const { id } = useParams(); // VisualAnalysis component id
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [componentName, setComponentName] = useState("");

  const [config, setConfig] = useState({ charts: [] });

  const [eventComponents, setEventComponents] = useState([]);
  const [recordsByComponent, setRecordsByComponent] = useState({}); // compId -> records

  const [types, setTypes] = useState([]);
  const [instancesMap, setInstancesMap] = useState({});
  const [propertiesMap, setPropertiesMap] = useState({});
  const [sourceDataSources, setSourceDataSources] = useState([]); // SOURCE DS names
  const [sourceComponentsByName, setSourceComponentsByName] = useState({}); // name -> comps
  const [scenarios, setScenarios] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const compRes = await api.get(`/components/${id}/`);
        setComponentName(compRes.data?.name || "Component");

        const confRes = await api.get(`/components/visual-analysis/${id}/config/`);
        setConfig(confRes.data || { charts: [] });

        const metaRes = await api.get("/object-metadata/");
        setTypes(metaRes.data.types);
        setInstancesMap(metaRes.data.instances);
        setPropertiesMap(metaRes.data.properties);

        const evRes = await api.get(`/data-sources/Events/components/`);
        setEventComponents(evRes.data || []);

        // Load SOURCE data sources and their components
        const dsRes = await api.get(`/data-sources/`);
        const srcDS = (dsRes.data || []).filter(d => d.data_source_type === 'SOURCE');
        setSourceDataSources(srcDS.map(d => d.data_source_name));
        const compMap = {};
        for (const name of srcDS.map(d => d.data_source_name)) {
          try {
            const r = await api.get(`/data-sources/${name}/components/`);
            compMap[name] = r.data || [];
          } catch {
            compMap[name] = [];
          }
        }
        setSourceComponentsByName(compMap);

        // Load scenarios
        const scRes = await api.get(`/scenarios/all/`);
        setScenarios(scRes.data || []);

        setLoading(false);
      } catch (e) {
        console.error(e);
        setError("Failed to load visual analysis data");
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const ensureRecordsLoaded = async (componentId) => {
    if (recordsByComponent[componentId]) return;
    try {
      const res = await api.get(`/components/events/${componentId}`);
      setRecordsByComponent((prev) => ({ ...prev, [componentId]: res.data || [] }));
    } catch (e) {
      console.error("Records load failed", e);
      setRecordsByComponent((prev) => ({ ...prev, [componentId]: [] }));
    }
  };

  const addChart = () => setConfig((c) => ({ ...c, charts: [...(c.charts || []), { title: "Chart", series: [], start: "", end: "" }] }));
  const removeChart = (idx) => setConfig((c) => ({ ...c, charts: c.charts.filter((_, i) => i !== idx) }));

  const addSeries = (chartIdx) => setConfig((c) => {
    const charts = [...(c.charts || [])];
    charts[chartIdx].series.push({
      label: "Series",
      source: "Events", // Events | Source | Scenario
      // Events
      component_ids: [],
      diff_mode: "overlay",
      baseline_component_id: null,
      // Source
      source_name: "",
      source_component_id: null,
      properties: [],
      // Scenario
      scenario_id: null,
      scenario_comp_a_id: null,
      scenario_comp_b_id: null,
      // Common filters
      type: "",
      property: "",
      instances: [],
    });
    return { ...c, charts };
  });
  const removeSeries = (chartIdx, sIdx) => setConfig((c) => {
    const charts = [...(c.charts || [])];
    charts[chartIdx].series.splice(sIdx, 1);
    return { ...c, charts };
  });

  const updateChart = (idx, patch) => setConfig((c) => {
    const charts = [...(c.charts || [])];
    charts[idx] = { ...charts[idx], ...patch };
    return { ...c, charts };
  });
  const updateSeries = (chartIdx, sIdx, patch) => setConfig((c) => {
    const charts = [...(c.charts || [])];
    charts[chartIdx].series[sIdx] = { ...charts[chartIdx].series[sIdx], ...patch };
    return { ...c, charts };
  });

  const saveConfig = async () => {
    try {
      await api.put(`/components/visual-analysis/${id}/config/`, { charts: config.charts });
      alert("Saved");
    } catch (e) {
      console.error(e);
      alert("Save failed");
    }
  };

  const pointsFor = (componentId, typeName, propertyName, instances, start, end) => {
    const recs = recordsByComponent[componentId] || [];
    const typeId = types.find(t => t.name === typeName)?.id;
    if (!typeId) return {};
    const startTs = start ? new Date(start).getTime() : null;
    const endTs = end ? new Date(end).getTime() : null;
    const ptsByInst = {};
    for (const r of recs) {
      if (r.object_type !== typeId) continue;
      const instName = (instancesMap[typeName] || []).find(x => x.id === r.object_instance)?.name;
      const propName = (propertiesMap[typeName] || []).find(x => x.id === r.object_type_property)?.name;
      if (!instName || !propName) continue;
      if (propertyName && propName !== propertyName) continue;
      if (Array.isArray(instances) && instances.length > 0 && !instances.includes(instName)) continue;
      if (!r.date_time) continue;
      const tx = new Date(r.date_time);
      if (isNaN(tx.getTime())) continue;
      const ts = tx.getTime();
      if (startTs && ts < startTs) continue;
      if (endTs && ts > endTs) continue;
      const y = Number(r.value);
      if (!isFinite(y)) continue;
      if (!ptsByInst[instName]) ptsByInst[instName] = [];
      ptsByInst[instName].push({ x: tx, y });
    }
    for (const k of Object.keys(ptsByInst)) ptsByInst[k].sort((a, b) => a.x - b.x);
    return ptsByInst;
  };

  const buildDatasets = (chart) => {
    const datasets = [];
    chart.series.forEach((s, idx) => {
      if (s.source === 'Events') {
        if (!s.type || !s.property || !Array.isArray(s.component_ids) || s.component_ids.length === 0) return;
        if ((s.diff_mode || 'overlay') === 'overlay') {
          s.component_ids.forEach((cid, i2) => {
            const ptsByInst = pointsFor(cid, s.type, s.property, s.instances, chart.start, chart.end);
            Object.entries(ptsByInst).forEach(([inst, pts]) => {
              const c = COLORS[(idx + i2) % COLORS.length];
              datasets.push({ label: `${s.label || s.property} — ${inst} (C${cid})`, data: pts, borderColor: c, backgroundColor: `${c}33`, borderWidth: 2, tension: 0.2, pointRadius: 2 });
            });
          });
        } else {
          const baseId = s.baseline_component_id || s.component_ids[0];
          const basePtsByInst = pointsFor(baseId, s.type, s.property, s.instances, chart.start, chart.end);
          s.component_ids.filter(cid => cid !== baseId).forEach((cid, i2) => {
            const otherPtsByInst = pointsFor(cid, s.type, s.property, s.instances, chart.start, chart.end);
            Object.keys(basePtsByInst).forEach(inst => {
              const a = basePtsByInst[inst] || [];
              const b = otherPtsByInst[inst] || [];
              const mapB = new Map(b.map(p => [new Date(p.x).getTime(), p.y]));
              const diffPts = [];
              a.forEach(p => {
                const ts = new Date(p.x).getTime();
                if (mapB.has(ts)) {
                  const by = mapB.get(ts);
                  const val = (s.diff_mode === 'percent') ? (by !== 0 ? ((p.y - by) / by) * 100 : null) : (p.y - by);
                  if (val !== null) diffPts.push({ x: p.x, y: val });
                }
              });
              if (diffPts.length) {
                const c = COLORS[(idx + i2) % COLORS.length];
                const lbl = s.diff_mode === 'percent' ? `%Δ ${inst} C${cid}-C${baseId}` : `Δ ${inst} C${cid}-C${baseId}`;
                datasets.push({ label: `${s.label || s.property} — ${lbl}`, data: diffPts, borderColor: c, backgroundColor: `${c}33`, borderWidth: 2, tension: 0.2, pointRadius: 2 });
              }
            });
          });
        }
        return;
      }

      if (s.source === 'Source') {
        if (!s.source_name || !s.source_component_id || !s.type) return;
        const props = Array.isArray(s.properties) && s.properties.length ? s.properties : (s.property ? [s.property] : []);
        props.forEach((prop, i2) => {
          const ptsByInst = pointsFor(s.source_component_id, s.type, prop, s.instances, chart.start, chart.end);
          Object.entries(ptsByInst).forEach(([inst, pts]) => {
            const c = COLORS[(idx + i2) % COLORS.length];
            datasets.push({ label: `${s.label || prop} — ${inst}`, data: pts, borderColor: c, backgroundColor: `${c}33`, borderWidth: 2, tension: 0.2, pointRadius: 2 });
          });
        });
        return;
      }

      if (s.source === 'Scenario') {
        if (!s.scenario_id || !s.type || !s.property || !s.scenario_comp_a_id || !s.scenario_comp_b_id) return;
        const compA = s.scenario_comp_a_id;
        const compB = s.scenario_comp_b_id;
        if ((s.diff_mode || 'overlay') === 'overlay') {
          [compA, compB].forEach((cid, i2) => {
            const ptsByInst = pointsFor(cid, s.type, s.property, s.instances, chart.start, chart.end);
            Object.entries(ptsByInst).forEach(([inst, pts]) => {
              const c = COLORS[(idx + i2) % COLORS.length];
              datasets.push({ label: `${s.label || s.property} — ${inst} (C${cid})`, data: pts, borderColor: c, backgroundColor: `${c}33`, borderWidth: 2, tension: 0.2, pointRadius: 2 });
            });
          });
        } else {
          const baseId = compA;
          const otherId = compB;
          const basePtsByInst = pointsFor(baseId, s.type, s.property, s.instances, chart.start, chart.end);
          const otherPtsByInst = pointsFor(otherId, s.type, s.property, s.instances, chart.start, chart.end);
          Object.keys(basePtsByInst).forEach(inst => {
            const a = basePtsByInst[inst] || [];
            const b = otherPtsByInst[inst] || [];
            const mapB = new Map(b.map(p => [new Date(p.x).getTime(), p.y]));
            const diffPts = [];
            a.forEach(p => {
              const ts = new Date(p.x).getTime();
              if (mapB.has(ts)) {
                const by = mapB.get(ts);
                const val = (s.diff_mode === 'percent') ? (by !== 0 ? ((p.y - by) / by) * 100 : null) : (p.y - by);
                if (val !== null) diffPts.push({ x: p.x, y: val });
              }
            });
            if (diffPts.length) {
              const c = COLORS[idx % COLORS.length];
              datasets.push({ label: `${s.label || s.property} — Δ ${inst} C${otherId}-C${baseId}`, data: diffPts, borderColor: c, backgroundColor: `${c}33`, borderWidth: 2, tension: 0.2, pointRadius: 2 });
            }
          });
        }
        return;
      }
    });
    return datasets;
  };

  if (loading) return <Spinner animation="border" />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <Card className="ds-card p-4">
      <div className="d-flex justify-content-between mb-3">
        <h4 className="ds-heading">📊 Visual Analysis — {componentName}</h4>
        <div className="d-flex gap-2">
          <Button variant="none" className="btn-brand" onClick={saveConfig}>💾 Save</Button>
          <Button variant="none" className="btn-brand" onClick={() => navigate(-1)}>← Back</Button>
        </div>
      </div>

      <div className="mb-3 d-flex gap-2">
        <Button variant="none" className="btn-brand" onClick={addChart}>+ Add Chart</Button>
      </div>

      {(config.charts || []).map((chart, cIdx) => (
        <div key={cIdx} className="mb-4 p-3" style={{ border: "1px solid var(--bs-border-color)", borderRadius: 8 }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <Form.Control
              className="ds-input"
              style={{ maxWidth: 360 }}
              value={chart.title || ""}
              onChange={(e) => updateChart(cIdx, { title: e.target.value })}
            />
            <div className="d-flex gap-2">
              <Form.Control type="datetime-local" className="ds-input" value={chart.start || ""} onChange={(e) => updateChart(cIdx, { start: e.target.value })} />
              <Form.Control type="datetime-local" className="ds-input" value={chart.end || ""} onChange={(e) => updateChart(cIdx, { end: e.target.value })} />
              <Button variant="outline-danger" size="sm" className="btn-danger-outline" onClick={() => removeChart(cIdx)}>Delete</Button>
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2 mb-2">
            <Button variant="none" className="btn-brand" onClick={() => addSeries(cIdx)}>+ Add Series</Button>
          </div>

          {(chart.series || []).map((s, sIdx) => (
            <div key={sIdx} className="d-flex flex-wrap gap-2 align-items-center mb-2">
              <Form.Control
                className="ds-input"
                style={{ maxWidth: 200 }}
                placeholder="Label"
                value={s.label || ""}
                onChange={(e) => updateSeries(cIdx, sIdx, { label: e.target.value })}
              />
              <Form.Select
                className="ds-input"
                style={{ maxWidth: 160 }}
                value={s.source}
                onChange={(e) => updateSeries(cIdx, sIdx, { source: e.target.value })}
              >
                <option value="Events">Events</option>
                <option value="Source">Source</option>
                <option value="Scenario">Scenario</option>
              </Form.Select>

              {s.source === 'Events' && (
                <>
                  <Form.Select
                    multiple
                    className="ds-input"
                    style={{ minWidth: 260, height: 100 }}
                    value={s.component_ids || []}
                    onChange={async (e) => {
                      const ids = Array.from(e.target.selectedOptions).map(o => Number(o.value));
                      updateSeries(cIdx, sIdx, { component_ids: ids });
                      for (const cid of ids) await ensureRecordsLoaded(cid);
                    }}
                  >
                    {eventComponents.map(ec => (
                      <option key={ec.id} value={ec.id}>{ec.name}</option>
                    ))}
                  </Form.Select>
                  <Form.Select
                    className="ds-input"
                    style={{ maxWidth: 160 }}
                    value={s.diff_mode || 'overlay'}
                    onChange={(e) => updateSeries(cIdx, sIdx, { diff_mode: e.target.value })}
                  >
                    <option value="overlay">Overlay</option>
                    <option value="difference">Difference</option>
                    <option value="percent">Percent</option>
                  </Form.Select>
                  <Form.Select
                    className="ds-input"
                    style={{ maxWidth: 200 }}
                    value={s.baseline_component_id || ''}
                    onChange={(e) => updateSeries(cIdx, sIdx, { baseline_component_id: Number(e.target.value) || null })}
                    disabled={(s.diff_mode || 'overlay') === 'overlay'}
                  >
                    <option value="">Baseline</option>
                    {(s.component_ids || []).map(cid => (
                      <option key={cid} value={cid}>{`Comp ${cid}`}</option>
                    ))}
                  </Form.Select>
                </>
              )}

              {s.source === 'Source' && (
                <>
                  <Form.Select
                    className="ds-input"
                    style={{ maxWidth: 200 }}
                    value={s.source_name || ''}
                    onChange={(e) => updateSeries(cIdx, sIdx, { source_name: e.target.value, source_component_id: null })}
                  >
                    <option value="">Data Source</option>
                    {sourceDataSources.map(n => <option key={n} value={n}>{n}</option>)}
                  </Form.Select>
                  <Form.Select
                    className="ds-input"
                    style={{ maxWidth: 260 }}
                    value={s.source_component_id || ''}
                    onChange={async (e) => {
                      const compId = Number(e.target.value) || null;
                      updateSeries(cIdx, sIdx, { source_component_id: compId });
                      if (compId) await ensureRecordsLoaded(compId);
                    }}
                    disabled={!s.source_name}
                  >
                    <option value="">Select Component</option>
                    {(sourceComponentsByName[s.source_name] || []).map(ec => (
                      <option key={ec.id} value={ec.id}>{ec.name}</option>
                    ))}
                  </Form.Select>
                </>
              )}

              {s.source === 'Scenario' && (
                <>
                  <Form.Select
                    className="ds-input"
                    style={{ maxWidth: 220 }}
                    value={s.scenario_id || ''}
                    onChange={(e) => updateSeries(cIdx, sIdx, { scenario_id: Number(e.target.value) || null, scenario_comp_a_id: null, scenario_comp_b_id: null })}
                  >
                    <option value="">Scenario</option>
                    {scenarios.map(sc => (
                      <option key={sc.scenario_id} value={sc.scenario_id}>{sc.scenario_name}</option>
                    ))}
                  </Form.Select>
                  {s.scenario_id && (
                    <>
                      <Form.Select
                        className="ds-input"
                        style={{ maxWidth: 240 }}
                        value={s.scenario_comp_a_id || ''}
                        onChange={async (e) => { const idv = Number(e.target.value) || null; updateSeries(cIdx, sIdx, { scenario_comp_a_id: idv }); if (idv) await ensureRecordsLoaded(idv); }}
                      >
                        <option value="">Comp A (Events)</option>
                        {(scenarios.find(sc => sc.scenario_id === s.scenario_id)?.components || []).filter(c => c.data_source_name === 'Events').map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </Form.Select>
                      <Form.Select
                        className="ds-input"
                        style={{ maxWidth: 240 }}
                        value={s.scenario_comp_b_id || ''}
                        onChange={async (e) => { const idv = Number(e.target.value) || null; updateSeries(cIdx, sIdx, { scenario_comp_b_id: idv }); if (idv) await ensureRecordsLoaded(idv); }}
                      >
                        <option value="">Comp B (Events)</option>
                        {(scenarios.find(sc => sc.scenario_id === s.scenario_id)?.components || []).filter(c => c.data_source_name === 'Events').map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </Form.Select>
                      <Form.Select
                        className="ds-input"
                        style={{ maxWidth: 160 }}
                        value={s.diff_mode || 'overlay'}
                        onChange={(e) => updateSeries(cIdx, sIdx, { diff_mode: e.target.value })}
                      >
                        <option value="overlay">Overlay</option>
                        <option value="difference">Difference</option>
                        <option value="percent">Percent</option>
                      </Form.Select>
                    </>
                  )}
                </>
              )}
              <Form.Select
                className="ds-input"
                style={{ maxWidth: 220 }}
                value={s.type || ""}
                onChange={(e) => updateSeries(cIdx, sIdx, { type: e.target.value, property: "", instances: [], properties: [] })}
              >
                <option value="">Type</option>
                {types.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </Form.Select>
              <Form.Select
                className="ds-input"
                style={{ maxWidth: 240 }}
                value={s.property || ""}
                onChange={(e) => updateSeries(cIdx, sIdx, { property: e.target.value })}
                disabled={!s.type}
              >
                <option value="">Property</option>
                {(propertiesMap[s.type] || []).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </Form.Select>
              {s.source === 'Source' && (
                <Form.Select
                  multiple
                  className="ds-input"
                  style={{ minWidth: 220, height: 100 }}
                  value={s.properties || []}
                  onChange={(e) => updateSeries(cIdx, sIdx, { properties: Array.from(e.target.selectedOptions).map(o => o.value) })}
                  disabled={!s.type}
                >
                  {(propertiesMap[s.type] || []).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </Form.Select>
              )}
              <Form.Select
                multiple
                className="ds-input"
                style={{ minWidth: 240, height: 100 }}
                value={s.instances || []}
                onChange={(e) => updateSeries(cIdx, sIdx, { instances: Array.from(e.target.selectedOptions).map(o => o.value) })}
                disabled={!s.type}
              >
                {(instancesMap[s.type] || []).map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
              </Form.Select>
              <Button variant="outline-danger" size="sm" className="btn-danger-outline" onClick={() => removeSeries(cIdx, sIdx)}>Remove</Button>
            </div>
          ))}

          <div style={{ height: 420, position: "relative" }}>
            {(() => {
              const datasets = buildDatasets(chart);
              if (datasets.length === 0) return <Alert variant="info">No data for current series/filters.</Alert>;
              return (
                <Line
                  data={{ datasets }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: true, position: "top" }, title: { display: !!chart.title, text: chart.title } },
                    scales: { x: { type: "time" }, y: { beginAtZero: false } },
                  }}
                  height={420}
                />
              );
            })()}
          </div>
        </div>
      ))}
    </Card>
  );
}
