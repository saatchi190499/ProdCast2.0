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

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    const fetchAll = async () => {
      try {
        // Get scenarios and find the chosen one
        const scnRes = await api.get("/scenarios/all/");
        const scn = (scnRes.data || []).find(x => String(x.scenario_id) === String(scenarioId));
        if (!scn) throw new Error("Scenario not found");
        setScenarioName(scn.scenario_name || `Scenario ${scenarioId}`);

        // Metadata for mapping ids to names
        const metaRes = await api.get("/object-metadata/");
        const t = metaRes.data.types;
        const inst = metaRes.data.instances;
        const props = metaRes.data.properties;
        setTypes(t);
        setInstancesMap(inst);
        setPropertiesMap(props);

        // Pull MainClass records for each component in the scenario
        const compIds = (scn.components || []).map(c => c.id);
        const recLists = await Promise.all(
          compIds.map(id => api.get(`/components/events/${id}`))
        );
        const all = recLists.flatMap(r => r.data || []);
        const filtered = all.filter(r => String(r.scenario) === String(scenarioId));
        setRecords(filtered);

        // Default filters: first type/property/instances
        if (t.length > 0) {
          const defType = t[0].name;
          setSelectedType(defType);
          const propList = props[defType] || [];
          if (propList.length > 0) setSelectedProperty(propList[0].name);
          const instList = inst[defType] || [];
          setSelectedInstances(instList.slice(0, 3).map(x => x.name));
        }

        // Default date range: last 30 days
        const now = new Date();
        const ago = new Date(now);
        ago.setDate(now.getDate() - 30);
        const toLocalIso = (d) => {
          const offsetMs = d.getTimezoneOffset() * 60000;
          return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
        };
        setStart(toLocalIso(ago));
        setEnd(toLocalIso(now));

        setLoading(false);
      } catch (e) {
        console.error(e);
        setError("Failed to load scenario results");
        setLoading(false);
      }
    };
    fetchAll();
  }, [scenarioId]);

  const filteredPointsByInstance = useMemo(() => {
    if (!selectedType || !selectedProperty) return {};
    const startTs = start ? new Date(start).getTime() : null;
    const endTs = end ? new Date(end).getTime() : null;

    const typeIdByName = Object.fromEntries(types.map(t => [t.name, t.id]));
    const thisTypeId = typeIdByName[selectedType];

    const pointsByInstance = {};
    for (const r of records) {
      if (r.object_type !== thisTypeId) continue;

      const instList = instancesMap[selectedType] || [];
      const propsList = propertiesMap[selectedType] || [];
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

      const y = Number(r.value);
      if (!isFinite(y)) continue;

      if (!pointsByInstance[instName]) pointsByInstance[instName] = [];
      pointsByInstance[instName].push({ x: t, y });
    }

    for (const k of Object.keys(pointsByInstance)) {
      pointsByInstance[k].sort((a, b) => a.x - b.x);
    }
    return pointsByInstance;
  }, [records, selectedType, selectedProperty, selectedInstances, start, end, types, instancesMap, propertiesMap]);

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

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: false },
    plugins: {
      legend: { position: "top" },
      title: { display: true, text: `Results • ${scenarioName}` },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}` } }
    },
    scales: {
      x: { type: "time", time: { unit: "day" } },
      y: { beginAtZero: false }
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="d-flex align-items-center" style={{ gap: 12 }}>
          <Spinner animation="border" size="sm" />
          <span>Loading scenario results…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <Alert variant="danger">{error}</Alert>
        <Button variant="none" className="btn-brand" onClick={() => navigate(-1)}>← Back</Button>
      </div>
    );
  }

  const propertiesOfType = selectedType ? (propertiesMap[selectedType] || []) : [];
  const instancesOfType = selectedType ? (instancesMap[selectedType] || []) : [];

  return (
    <div className="container">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h3 className="ds-title" style={{ margin: 0 }}>{scenarioName}</h3>
        <Button variant="none" className="btn-brand" onClick={() => navigate(-1)}>← Back</Button>
      </div>

      <Card className="mb-3">
        <Card.Body>
          <div className="row g-3">
            <div className="col-md-3">
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
            <div className="col-md-3">
              <Form.Label className="ds-title">Property</Form.Label>
              <Form.Select
                className="ds-input form-select"
                value={selectedProperty}
                onChange={e => setSelectedProperty(e.target.value)}
              >
                {propertiesOfType.map(p => (
                  <option key={p.id} value={p.name}>{p.name}{p.unit ? ` (${p.unit})` : ""}</option>
                ))}
              </Form.Select>
            </div>
            <div className="col-md-6">
              <Form.Label className="ds-title">Instances</Form.Label>
              <Form.Select
                multiple
                className="ds-input form-select"
                value={selectedInstances}
                onChange={e => setSelectedInstances(Array.from(e.target.selectedOptions).map(o => o.value))}
                style={{ height: 120 }}
              >
                {instancesOfType.map(inst => (
                  <option key={inst.id} value={inst.name}>{inst.name}</option>
                ))}
              </Form.Select>
            </div>
          </div>

          <div className="row g-3 mt-1">
            <div className="col-md-3">
              <Form.Label className="ds-title">Start</Form.Label>
              <Form.Control
                type="datetime-local"
                className="ds-input"
                value={start}
                onChange={e => setStart(e.target.value)}
              />
            </div>
            <div className="col-md-3">
              <Form.Label className="ds-title">End</Form.Label>
              <Form.Control
                type="datetime-local"
                className="ds-input"
                value={end}
                onChange={e => setEnd(e.target.value)}
              />
            </div>
          </div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Body>
          <div style={{ height: 480 }}>
            <Line data={chartData} options={chartOptions} height={480} />
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}

