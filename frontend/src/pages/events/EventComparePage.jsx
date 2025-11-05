import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../utils/axiosInstance";
import { Card, Form, Row, Col, Spinner, Alert } from "react-bootstrap";
import { Scatter } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LinearScale,
  TimeScale,
  PointElement,
  Tooltip,
  Legend,
  Title
} from "chart.js";
import "chartjs-adapter-date-fns";

ChartJS.register(LinearScale, TimeScale, PointElement, Tooltip, Legend, Title);

export default function EventComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [eventsComponents, setEventsComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [metaTypes, setMetaTypes] = useState([]); // [{id, name}]
  const [metaInstances, setMetaInstances] = useState({}); // { typeName: [{id, name}] }
  const [metaProperties, setMetaProperties] = useState({}); // { typeName: [{id, name, unit, category}] }

  const [unitSystemMappings, setUnitSystemMappings] = useState([]);
  const [selectedUnitSystemId, setSelectedUnitSystemId] = useState(null);

  // Selections
  const [eventA, setEventA] = useState(searchParams.get("a") || "");
  const [eventB, setEventB] = useState(searchParams.get("b") || "");

  const [objectType, setObjectType] = useState("");
  const [objectInstance, setObjectInstance] = useState(""); // optional filter
  const [propertyName, setPropertyName] = useState("");

  // Data for each selected event set
  const [recordsA, setRecordsA] = useState([]);
  const [recordsB, setRecordsB] = useState([]);
  const [componentAName, setComponentAName] = useState("");
  const [componentBName, setComponentBName] = useState("");

  // Helpers for units
  const getConversionForProperty = (propName) => {
    if (!selectedUnitSystemId) return { scale: 1, offset: 0 };
    const system = unitSystemMappings.find((s) => s.unit_system_id === selectedUnitSystemId);
    if (!system) return { scale: 1, offset: 0 };
    const prop = system.properties.find((p) => p.property_name === propName);
    return { scale: prop?.scale_factor ?? 1, offset: prop?.offset ?? 0 };
  };
  const getUnitForProperty = (propName) => {
    if (!selectedUnitSystemId) return "";
    const system = unitSystemMappings.find((s) => s.unit_system_id === selectedUnitSystemId);
    if (!system) return "";
    const prop = system.properties.find((p) => p.property_name === propName);
    return prop?.unit || "";
  };

  // Convert IDs in records to human names using current metadata
  const convertIdsToNames = (data) => {
    return data.map((r) => {
      const typeName = metaTypes.find((t) => t.id === r.object_type)?.name || r.object_type;
      const instanceName = Object.values(metaInstances)
        .flat()
        .find((x) => x.id === r.object_instance)?.name || r.object_instance;
      const propObj = Object.values(metaProperties)
        .flat()
        .find((x) => x.id === r.object_type_property);
      return {
        ...r,
        object_type: typeName,
        object_instance: instanceName,
        object_type_property: propObj?.name || r.object_type_property,
        unit: propObj?.unit || r.unit || "",
      };
    });
  };

  // Initial data load: components list, metadata, unit mappings
  useEffect(() => {
    const load = async () => {
      try {
        const [compRes, metaRes, unitRes] = await Promise.all([
          api.get("/data-sources/Events/components/"),
          api.get("/object-metadata/"),
          api.get("/unit-system-property-mapping/")
        ]);
        setEventsComponents(compRes.data || []);
        setMetaTypes(metaRes.data.types || []);
        setMetaInstances(metaRes.data.instances || {});
        setMetaProperties(metaRes.data.properties || {});
        setUnitSystemMappings(unitRes.data || []);
        const oilField = (unitRes.data || []).find((s) => s.unit_system_name === "Oil Field");
        setSelectedUnitSystemId(oilField ? oilField.unit_system_id : (unitRes.data?.[0]?.unit_system_id || null));
        setLoading(false);
      } catch (err) {
        setError("Failed to load metadata or components");
        setLoading(false);
      }
    };
    load();
  }, []);

  // Fetch records when an event set changes
  useEffect(() => {
    const fetchRecords = async (compId, setRecords, setCompName) => {
      if (!compId) {
        setRecords([]);
        setCompName("");
        return;
      }
      try {
        const [compRes, recRes] = await Promise.all([
          api.get(`/components/${compId}/`),
          api.get(`/components/events/${compId}`)
        ]);
        setCompName(compRes.data?.name || `Component ${compId}`);
        setRecords(convertIdsToNames(recRes.data || []));
      } catch (err) {
        setRecords([]);
      }
    };
    fetchRecords(eventA, setRecordsA, setComponentAName);
    fetchRecords(eventB, setRecordsB, setComponentBName);
  }, [eventA, eventB, metaTypes, metaInstances, metaProperties]);

  // Keep URL in sync for convenience
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (eventA) params.set("a", eventA); else params.delete("a");
    if (eventB) params.set("b", eventB); else params.delete("b");
    setSearchParams(params, { replace: true });
  }, [eventA, eventB]);

  // Property options based on selected object type
  const propertyOptions = useMemo(() => metaProperties[objectType] || [], [metaProperties, objectType]);
  const instanceOptions = useMemo(() => metaInstances[objectType] || [], [metaInstances, objectType]);

  // Filter and map records to scatter points for chartjs
  const makePoints = (records) => {
    if (!objectType || !propertyName) return [];
    const filtered = records.filter((r) => {
      if (r.object_type !== objectType) return false;
      if (r.object_type_property !== propertyName) return false;
      if (objectInstance && r.object_instance !== objectInstance) return false;
      if (r.value === "" || r.value === null || isNaN(Number(r.value))) return false;
      return !!r.date_time;
    });
    // Convert from base units to selected display units for chart
    const { scale, offset } = getConversionForProperty(propertyName);
    return filtered.map((r) => ({
      x: new Date(r.date_time),
      y: Number(r.value) * scale + offset,
    }));
  };

  const pointsA = useMemo(() => makePoints(recordsA), [recordsA, objectType, propertyName, objectInstance, selectedUnitSystemId]);
  const pointsB = useMemo(() => makePoints(recordsB), [recordsB, objectType, propertyName, objectInstance, selectedUnitSystemId]);

  const chartData = useMemo(() => ({
    datasets: [
      {
        label: componentAName || "Event A",
        data: pointsA,
        backgroundColor: "rgba(75, 192, 192, 0.7)",
        borderColor: "rgba(75, 192, 192, 1)",
        pointRadius: 3,
        showLine: false,
      },
      {
        label: componentBName || "Event B",
        data: pointsB,
        backgroundColor: "rgba(255, 99, 132, 0.7)",
        borderColor: "rgba(255, 99, 132, 1)",
        pointRadius: 3,
        showLine: false,
      },
    ],
  }), [pointsA, pointsB, componentAName, componentBName]);

  const unitLabel = getUnitForProperty(propertyName);
  const chartOptions = useMemo(() => ({
    responsive: true,
    parsing: false,
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: propertyName ? `${propertyName}${unitLabel ? `, ${unitLabel}` : ""}` : "Select property to compare",
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `(${ctx.parsed.x ? new Date(ctx.parsed.x).toLocaleString() : "-"}, ${ctx.parsed.y})`,
        },
      },
    },
    scales: {
      x: {
        type: "time",
        time: { unit: "day" },
        title: { display: true, text: "Time" },
      },
      y: {
        type: "linear",
        title: { display: true, text: unitLabel || "Value" },
        ticks: { beginAtZero: false },
      },
    },
  }), [propertyName, unitLabel]);

  if (loading) return <Spinner animation="border" />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <div className="ds-card p-4">
      <Card.Body>
        <h4 className="ds-heading">Compare Events by Property</h4>
        <Row className="mb-3">
          <Col md={4}>
            <Form.Group className="mb-3">
              <Form.Label>Event A</Form.Label>
              <Form.Select
                className="ds-input"
                value={eventA}
                onChange={(e) => setEventA(e.target.value)}
              >
                <option value="">Select event set...</option>
                {eventsComponents.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group className="mb-3">
              <Form.Label>Event B</Form.Label>
              <Form.Select
                className="ds-input"
                value={eventB}
                onChange={(e) => setEventB(e.target.value)}
              >
                <option value="">Select event set...</option>
                {eventsComponents.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group className="mb-3">
              <Form.Label>Unit System</Form.Label>
              <Form.Select
                className="ds-input"
                value={selectedUnitSystemId || ""}
                onChange={(e) => setSelectedUnitSystemId(Number(e.target.value) || null)}
              >
                {unitSystemMappings.map((s) => (
                  <option key={s.unit_system_id} value={s.unit_system_id}>{s.unit_system_name}</option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
        </Row>

        <Row className="mb-3">
          <Col md={4}>
            <Form.Group className="mb-3">
              <Form.Label>Object Type</Form.Label>
              <Form.Select
                className="ds-input"
                value={objectType}
                onChange={(e) => {
                  setObjectType(e.target.value);
                  setPropertyName("");
                  setObjectInstance("");
                }}
              >
                <option value="">Select object type...</option>
                {metaTypes.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group className="mb-3">
              <Form.Label>Property</Form.Label>
              <Form.Select
                className="ds-input"
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                disabled={!objectType}
              >
                <option value="">Select property...</option>
                {propertyOptions.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group className="mb-3">
              <Form.Label>Instance (optional)</Form.Label>
              <Form.Select
                className="ds-input"
                value={objectInstance}
                onChange={(e) => setObjectInstance(e.target.value)}
                disabled={!objectType}
              >
                <option value="">All instances</option>
                {instanceOptions.map((i) => (
                  <option key={i.id} value={i.name}>{i.name}</option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
        </Row>

        <div style={{ minHeight: 420 }}>
          <Scatter data={chartData} options={chartOptions} height={120} />
        </div>
      </Card.Body>
    </div>
  );
}

