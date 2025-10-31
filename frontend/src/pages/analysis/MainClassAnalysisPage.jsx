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

// Simple color palette for multiple instances
const COLORS = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
];

export default function MainClassAnalysisPage() {
  const { id } = useParams(); // component id
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [componentName, setComponentName] = useState("");
  const [records, setRecords] = useState([]);

  const [types, setTypes] = useState([]);
  const [instancesMap, setInstancesMap] = useState({}); // by type name
  const [propertiesMap, setPropertiesMap] = useState({}); // by type name

  const [selectedType, setSelectedType] = useState("");
  const [selectedProperty, setSelectedProperty] = useState("");
  const [selectedInstances, setSelectedInstances] = useState([]); // names

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const compRes = await api.get(`/components/${id}/`);
        setComponentName(compRes.data?.name ?? "Component");

        const metaRes = await api.get("/object-metadata/");
        const t = metaRes.data.types;
        const inst = metaRes.data.instances;
        const props = metaRes.data.properties;
        setTypes(t);
        setInstancesMap(inst);
        setPropertiesMap(props);

        const recRes = await api.get(`/components/events/${id}`);
        setRecords(recRes.data || []);

        // Default filters: try first type/property
        if (t.length > 0) {
          const defType = t[0].name;
          setSelectedType(defType);
          const propList = props[defType] || [];
          if (propList.length > 0) setSelectedProperty(propList[0].name);
          const instList = inst[defType] || [];
          setSelectedInstances(instList.slice(0, 3).map(x => x.name));
        }

        // Default date viewport: last 30 days
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
        setError("Failed to load data");
        setLoading(false);
      }
    };
    fetchAll();
  }, [id]);

  const filteredPointsByInstance = useMemo(() => {
    if (!selectedType || !selectedProperty) return {};
    const startTs = start ? new Date(start).getTime() : null;
    const endTs = end ? new Date(end).getTime() : null;

    // Transform records to friendly shape with names
    const typeIdByName = Object.fromEntries(types.map(t => [t.name, t.id]));
    const thisTypeId = typeIdByName[selectedType];

    const pointsByInstance = {};
    for (const r of records) {
      if (r.object_type !== thisTypeId) continue;

      // Find names from maps
      const instList = instancesMap[selectedType] || [];
      const propsList = propertiesMap[selectedType] || [];
      const instName = instList.find(x => x.id === r.object_instance)?.name;
      const propName = propsList.find(x => x.id === r.object_type_property)?.name;
      if (!instName || !propName) continue;
      if (propName !== selectedProperty) continue;
      if (selectedInstances.length > 0 && !selectedInstances.includes(instName)) continue;

      // Value must be numeric and date_time present
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

    // Sort by time
    for (const k of Object.keys(pointsByInstance)) {
      pointsByInstance[k].sort((a, b) => a.x - b.x);
    }

    return pointsByInstance;
  }, [records, types, instancesMap, propertiesMap, selectedType, selectedProperty, selectedInstances, start, end]);

  const chartData = useMemo(() => {
    const datasets = Object.entries(filteredPointsByInstance).map(([inst, pts], idx) => ({
      label: inst,
      data: pts,
      borderColor: COLORS[idx % COLORS.length],
      backgroundColor: `${COLORS[idx % COLORS.length]}33`,
      borderWidth: 2,
      tension: 0.2,
      fill: false,
      pointRadius: 2,
    }));
    return { datasets };
  }, [filteredPointsByInstance]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: "time",
        time: {
          tooltipFormat: "dd/MM/yyyy HH:mm",
        },
        ticks: { autoSkip: true, maxTicksLimit: 10 },
      },
      y: { beginAtZero: false },
    },
    plugins: {
      legend: { display: true, position: "top" },
      title: {
        display: true,
        text: `${selectedProperty || "Property"} — ${componentName}`,
      },
      tooltip: { mode: "nearest", intersect: false },
    },
  };

  const availableInstances = useMemo(() => (instancesMap[selectedType] || []).map(x => x.name), [instancesMap, selectedType]);
  const availableProps = useMemo(() => (propertiesMap[selectedType] || []).map(x => x.name), [propertiesMap, selectedType]);

  if (loading) return <Spinner animation="border" />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <Card className="ds-card p-4">
      <div className="d-flex justify-content-between mb-3">
        <h4 className="ds-heading">📊 Analysis — {componentName}</h4>
        <Button variant="none" className="btn-brand" onClick={() => navigate(-1)}>← Back</Button>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <Form.Select
          value={selectedType}
          onChange={(e) => {
            const next = e.target.value;
            setSelectedType(next);
            const props = propertiesMap[next] || [];
            setSelectedProperty(props[0]?.name || "");
            const insts = instancesMap[next] || [];
            setSelectedInstances(insts.slice(0, 3).map(x => x.name));
          }}
          style={{ maxWidth: 220 }}
          className="ds-input"
        >
          <option value="">Select Type</option>
          {types.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
        </Form.Select>

        <Form.Select
          value={selectedProperty}
          onChange={(e) => setSelectedProperty(e.target.value)}
          style={{ maxWidth: 260 }}
          className="ds-input"
          disabled={!selectedType}
        >
          <option value="">Select Property</option>
          {availableProps.map(n => <option key={n} value={n}>{n}</option>)}
        </Form.Select>

        <Form.Select
          multiple
          value={selectedInstances}
          onChange={(e) => setSelectedInstances(Array.from(e.target.selectedOptions).map(o => o.value))}
          style={{ minWidth: 260, maxWidth: 360, height: 120 }}
          className="ds-input"
          disabled={!selectedType}
        >
          {availableInstances.map(n => <option key={n} value={n}>{n}</option>)}
        </Form.Select>

        <Form.Control type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className="ds-input" />
        <Form.Control type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className="ds-input" />
      </div>

      <div style={{ height: 480, position: "relative" }}>
        {Object.keys(filteredPointsByInstance).length === 0 ? (
          <Alert variant="info">No numeric data matches current filters.</Alert>
        ) : (
          <Line data={chartData} options={chartOptions} height={480} />
        )}
      </div>
    </Card>
  );
}

