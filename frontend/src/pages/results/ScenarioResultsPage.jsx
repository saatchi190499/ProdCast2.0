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
  Filler,
} from "chart.js";
import "chartjs-adapter-date-fns";
import "../DataSourcePage.css";

ChartJS.register(TimeScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const COLORS = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
];

const toLocalIso = (d) => {
  const offsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
};

export default function ScenarioResultsPage() {
  const { scenarioId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [scenarioName, setScenarioName] = useState("");
  const [records, setRecords] = useState([]);

  const [types, setTypes] = useState([]);
  const [instancesMap, setInstancesMap] = useState({});
  const [propertiesMap, setPropertiesMap] = useState({});

  const [selectedType, setSelectedType] = useState("");
  const [selectedProperty, setSelectedProperty] = useState("");
  const [selectedInstances, setSelectedInstances] = useState([]);
  // Unit systems
  const [unitSystems, setUnitSystems] = useState([]); // [{id, name}]
  const [unitMapBySystem, setUnitMapBySystem] = useState({}); // sysId -> { propId -> {unit, scale_factor, offset} }
  const [selectedUnitSystemId, setSelectedUnitSystemId] = useState(null);

  // Start/end default to empty, then auto-set to min/max from data
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [autoRangeSet, setAutoRangeSet] = useState(false);

  // Load metadata + unit systems once per scenario
  useEffect(() => {
    const loadMeta = async () => {
      try {
        const metaRes = await api.get("/object-metadata/");
        const t = metaRes.data.types;
        const inst = metaRes.data.instances;
        const props = metaRes.data.properties;
        setTypes(t);
        setInstancesMap(inst);
        setPropertiesMap(props);

        if (!selectedType && t.length > 0) {
          const defType = t[0].name;
          setSelectedType(defType);
          const propList = props[defType] || [];
          if (!selectedProperty && propList.length > 0) setSelectedProperty(propList[0].name);
          const instList = inst[defType] || [];
          if (selectedInstances.length === 0) setSelectedInstances(instList.slice(0, 3).map(x => x.name));
        }

        try {
          const unitRes = await api.get("/unit-system-property-mapping/");
          const systems = (unitRes.data || []).map(s => ({ id: s.unit_system_id, name: s.unit_system_name, properties: s.properties }));
          setUnitSystems(systems.map(s => ({ id: s.id, name: s.name })));
          const mapBySystem = {};
          systems.forEach(s => {
            const m = {};
            (s.properties || []).forEach(p => {
              m[p.property_id] = { unit: p.unit, scale_factor: Number(p.scale_factor ?? 1), offset: Number(p.offset ?? 0) };
            });
            mapBySystem[s.id] = m;
          });
          setUnitMapBySystem(mapBySystem);
          if (!selectedUnitSystemId && systems.length > 0) setSelectedUnitSystemId(systems[0].id);
        } catch (e) {
          console.warn("Unit mapping load failed", e);
        }
      } catch (e) {
        console.error(e);
        setError("Failed to load metadata");
      }
    };
    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId]);

  // Load results separately and set scenario name from response
  useEffect(() => {
    const loadResults = async () => {
      setLoading(true);
      try {
        let res;
        if (start && end) {
          res = await api.get(`/scenarios/${scenarioId}/results/`, { params: { start, end } });
        } else {
          res = await api.get(`/scenarios/${scenarioId}/results/`);
        }
        const recs = (res.data && res.data.records) || [];
        setRecords(recs);
        const sn = res.data && res.data.scenario && res.data.scenario.scenario_name;
        if (sn) setScenarioName(sn);

        if (!autoRangeSet && (!start || !end) && recs.length > 0) {
          const times = recs
            .map(r => r.date_time ? new Date(r.date_time) : null)
            .filter(d => d && !isNaN(d.getTime()));
          if (times.length > 0) {
            const minD = new Date(Math.min(...times.map(d => d.getTime())));
            const maxD = new Date(Math.max(...times.map(d => d.getTime())));
            setStart(toLocalIso(minD));
            setEnd(toLocalIso(maxD));
            setAutoRangeSet(true);
          }
        }
        setLoading(false);
      } catch (e) {
        console.error(e);
        setError("Failed to load scenario results");
        setLoading(false);
      }
    };
    loadResults();
  }, [scenarioId, start, end, autoRangeSet]);

  const filteredPointsByInstance = useMemo(() => {
    if (!selectedType || !selectedProperty) return {};
    const startTs = start ? new Date(start).getTime() : null;
    const endTs = end ? new Date(end).getTime() : null;

    const typeIdByName = Object.fromEntries(types.map(t => [t.name, t.id]));
    const thisTypeId = typeIdByName[selectedType];

    const pointsByInstance = {};
    const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
    const propsList = propertiesMap[selectedType] || [];
    const selectedPropId = propsList.find(x => x.name === selectedProperty)?.id;
    const conv = selectedPropId ? sysMap[selectedPropId] : null;
    for (const r of records) {
      if (r.object_type !== thisTypeId) continue;

      const instList = instancesMap[selectedType] || [];
      const instName = instList.find(x => x.id === r.object_instance)?.name;
      const propName = propsList.find(x => x.id === r.object_type_property)?.name;
      if (!instName || !propName) continue;
      if (propName !== selectedProperty) continue;
      if (selectedInstances.length > 0 && !selectedInstances.includes(instName)) continue;

      if (!r.date_time) continue;
      const t = new Date(r.date_time);
      if (isNaN(t.getTime())) continue;
      if (startTs && t.getTime() < startTs) continue;
      if (endTs && t.getTime() > endTs) continue;

      let y = Number(r.value);
      if (!isFinite(y)) continue;
      if (conv) {
        y = y * Number(conv.scale_factor ?? 1) + Number(conv.offset ?? 0);
      }

      if (!pointsByInstance[instName]) pointsByInstance[instName] = [];
      pointsByInstance[instName].push({ x: t, y });
    }

    for (const k of Object.keys(pointsByInstance)) {
      pointsByInstance[k].sort((a, b) => a.x - b.x);
    }
    return pointsByInstance;
  }, [records, selectedType, selectedProperty, selectedInstances, start, end, types, instancesMap, propertiesMap, selectedUnitSystemId, unitMapBySystem]);

  const chartData = useMemo(() => {
    const instNames = Object.keys(filteredPointsByInstance);
    return {
      datasets: instNames.map((name, idx) => ({
        label: name,
        data: filteredPointsByInstance[name],
        fill: false,
        borderColor: COLORS[idx % COLORS.length],
        backgroundColor: COLORS[idx % COLORS.length],
        tension: 0.2,
        pointRadius: 0,
        borderWidth: 2,
      }))
    };
  }, [filteredPointsByInstance]);

  // Properties of selected type limited to category "Results"
  const propertiesOfTypeAll = selectedType ? (propertiesMap[selectedType] || []) : [];
  const propertiesOfType = propertiesOfTypeAll.filter(p => (p.category || "").toLowerCase() === "results");
  // Keep selected property valid for filtered list
  useEffect(() => {
    const exists = propertiesOfType.some(p => p.name === selectedProperty);
    if (!exists) setSelectedProperty(propertiesOfType[0]?.name || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, propertiesMap]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: false },
    plugins: {
      legend: { position: "top" },
      title: { display: true, text: `Results • ${scenarioName}` },
      tooltip: { callbacks: { label: (ctx) => {
        const val = ctx.parsed.y;
        const propsList = propertiesMap[selectedType] || [];
        const selectedPropId = propsList.find(x => x.name === selectedProperty)?.id;
        const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
        const unitLbl = (selectedPropId && sysMap[selectedPropId]?.unit) ? ` ${sysMap[selectedPropId].unit}` : "";
        return `${ctx.dataset.label}: ${val}${unitLbl}`;
      } } }
    },
    scales: {
      x: { type: "time", time: { unit: "day" } },
      y: { beginAtZero: false }
    }
  };

  if (loading) {
    return (
      <div className="container-fluid">
        <div className="d-flex align-items-center" style={{ gap: 12 }}>
          <Spinner animation="border" size="sm" />
          <span>Loading scenario results…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container-fluid">
        <Alert variant="danger">{error}</Alert>
        <Button variant="none" className="btn-brand" onClick={() => navigate(-1)}>← Back</Button>
      </div>
    );
  }

  const instancesOfType = selectedType ? (instancesMap[selectedType] || []) : [];

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h3 className="ds-title" style={{ margin: 0 }}>{scenarioName}</h3>
        <Button variant="none" className="btn-brand" onClick={() => navigate(-1)}>← Back</Button>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
        <div style={{ flex: "0 0 250px" }}>
          <Card className="mb-3" style={{ height: "100%" }}>
            <Card.Body>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <Form.Label className="ds-title">Unit System</Form.Label>
                  <Form.Select
                    className="ds-input form-select"
                    value={selectedUnitSystemId || ""}
                    onChange={e => setSelectedUnitSystemId(e.target.value ? Number(e.target.value) : null)}
                  >
                    {unitSystems.map(us => (
                      <option key={us.id} value={us.id}>{us.name}</option>
                    ))}
                  </Form.Select>
                </div>
                <div>
                  <Form.Label className="ds-title">Object Type</Form.Label>
                  <Form.Select
                    className="ds-input form-select"
                    value={selectedType}
                    onChange={e => {
                      const nt = e.target.value;
                      setSelectedType(nt);
                      // Reset dependent filters
                      const props = propertiesMap[nt] || [];
                      setSelectedProperty(props[0]?.name || "");
                      const insts = instancesMap[nt] || [];
                      setSelectedInstances(insts.slice(0, 3).map(x => x.name));
                    }}
                  >
                    {types.map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </Form.Select>
                </div>
                <div>
                  <Form.Label className="ds-title">Property</Form.Label>
                  <Form.Select
                    className="ds-input form-select"
                    value={selectedProperty}
                    onChange={e => setSelectedProperty(e.target.value)}
                  >
                    {propertiesOfType.map(p => {
                      const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
                      const u = sysMap[p.id]?.unit ?? p.unit;
                      return (
                        <option key={p.id} value={p.name}>{p.name}{u ? ` (${u})` : ""}</option>
                      );
                    })}
                  </Form.Select>
                </div>
                <div>
                  <Form.Label className="ds-title">Instances</Form.Label>
                  <Form.Select
                    multiple
                    className="ds-input form-select"
                    value={selectedInstances}
                    onChange={e => setSelectedInstances(Array.from(e.target.selectedOptions).map(o => o.value))}
                    style={{ height: "100%", maxWidth: 420 }}
                  >
                    {instancesOfType.map(inst => (
                      <option key={inst.id} value={inst.name}>{inst.name}</option>
                    ))}
                  </Form.Select>
                </div>
                <div>
                  <Form.Label className="ds-title">Start</Form.Label>
                  <Form.Control
                    type="datetime-local"
                    className="ds-input"
                    value={start}
                    onChange={e => setStart(e.target.value)}
                    style={{ maxWidth: 260 }}
                  />
                </div>
                <div>
                  <Form.Label className="ds-title">End</Form.Label>
                  <Form.Control
                    type="datetime-local"
                    className="ds-input"
                    value={end}
                    onChange={e => setEnd(e.target.value)}
                    style={{ maxWidth: 260 }}
                  />
                </div>
              </div>
            </Card.Body>
          </Card>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Card>
            <Card.Body>
              <div style={{ height: 600 }}>
                <Line data={chartData} options={chartOptions} height={600} />
              </div>
            </Card.Body>
          </Card>
        </div>
      </div>
    </div>
  );
}
