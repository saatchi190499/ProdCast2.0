import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../utils/axiosInstance";
import { Card, Form, Row, Col, Spinner, Alert, Button } from "react-bootstrap";
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

// Lightweight inline labels plugin (no external deps)
const InstanceLabelsPlugin = {
  id: "instanceLabels",
  afterDatasetsDraw(chart, args, pluginOptions) {
    const show = pluginOptions?.show;
    if (!show) return;
    const { ctx, chartArea } = chart;
    const { top, bottom, left, right } = chartArea || {};
    ctx.save();
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (!meta || meta.hidden) return;
      ctx.fillStyle = dataset.borderColor || "#444";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      meta.data.forEach((elem, i) => {
        const raw = dataset.data?.[i];
        const label = raw?.instance;
        if (!label) return;
        const props = elem.getProps(["x", "y"], true);
        const x = props.x;
        const y = props.y;
        if (left != null && right != null && top != null && bottom != null) {
          if (x < left || x > right || y < top || y > bottom) return;
        }
        ctx.fillText(label, x, y - 4);
      });
    });
    ctx.restore();
  },
};

ChartJS.register(LinearScale, TimeScale, PointElement, Tooltip, Legend, Title, InstanceLabelsPlugin);

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

  // Date range (x-axis) control
  const [rangeMin, setRangeMin] = useState(null); // string YYYY-MM-DD
  const [rangeMax, setRangeMax] = useState(null); // string YYYY-MM-DD

  // Labels on chart
  const [showLabels, setShowLabels] = useState(true);

  // Helpers for units
  const getConversionForProperty = (propName) => {
    if (!selectedUnitSystemId) return { scale: 1, offset: 0 };
    const system = unitSystemMappings.find((s) => s.unit_system_id === selectedUnitSystemId);
    if (!system) return { scale: 1, offset: 0 };
    if (propName === "Mask/Unmask") {
      const cand = system.properties.find((p) => ["mask", "unmask"].includes(String(p.property_name).toLowerCase()));
      return { scale: cand?.scale_factor ?? 1, offset: cand?.offset ?? 0 };
    }
    const prop = system.properties.find((p) => p.property_name === propName);
    return { scale: prop?.scale_factor ?? 1, offset: prop?.offset ?? 0 };
  };
  const getUnitForProperty = (propName) => {
    if (!selectedUnitSystemId) return "";
    const system = unitSystemMappings.find((s) => s.unit_system_id === selectedUnitSystemId);
    if (!system) return "";
    if (propName === "Mask/Unmask") {
      const cand = system.properties.find((p) => ["mask", "unmask"].includes(String(p.property_name).toLowerCase()));
      return cand?.unit || "";
    }
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
  const propertyOptions = useMemo(() => {
    const list = (metaProperties[objectType] || []).filter((p) => p.category !== "Results");
    const hasMask = list.some((p) => String(p.name).toLowerCase() === "mask");
    const hasUnmask = list.some((p) => String(p.name).toLowerCase() === "unmask");
    let out = list.filter((p) => {
      const nm = String(p.name).toLowerCase();
      if (hasMask || hasUnmask) {
        if (nm === "mask" || nm === "unmask") return false;
      }
      return true;
    });
    if (hasMask || hasUnmask) {
      out = [{ id: "mask_unmask", name: "Mask/Unmask", unit: "" }, ...out];
    }
    return out;
  }, [metaProperties, objectType]);
  const instanceOptions = useMemo(() => metaInstances[objectType] || [], [metaInstances, objectType]);

  // Helpers for grouping and display
  const toYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const normVal = (v) => Math.round(Number(v) * 1e6); // value tolerance bucket

  // Filter and map records to scatter points for chartjs
  const makePoints = (records) => {
    if (!objectType || !propertyName) return [];
    const filtered = records.filter((r) => {
      if (r.object_type !== objectType) return false;
      const propNm = String(r.object_type_property).toLowerCase();
      if (propertyName === "Mask/Unmask") {
        if (!(propNm === "mask" || propNm === "unmask")) return false;
      } else {
        if (r.object_type_property !== propertyName) return false;
      }
      if (objectInstance && r.object_instance !== objectInstance) return false;
      if (r.value === "" || r.value === null || isNaN(Number(r.value))) return false;
      return !!r.date_time;
    });
    // Convert from base units to selected display units for chart
    const { scale, offset } = getConversionForProperty(propertyName);
    const minDate = rangeMin ? new Date(`${rangeMin}T00:00:00`) : null;
    const maxDate = rangeMax ? new Date(`${rangeMax}T23:59:59`) : null;
    return filtered
      .map((r) => {
        const x = new Date(r.date_time);
        const y = Number(r.value) * scale + offset;
        const ymd = toYMD(x);
        const yNorm = normVal(y);
        const groupKey = `${ymd}|${yNorm}`;
        return { x, x0: x, y, instance: r.object_instance, ymd, yNorm, groupKey };
      })
      .filter((pt) => {
        const afterMin = !minDate || pt.x >= minDate;
        const beforeMax = !maxDate || pt.x <= maxDate;
        return afterMin && beforeMax;
      });
  };

  // Jitter points that land on the exact same day & value to make them visible
  const jitterGroupedPoints = (pts) => {
    if (!pts.length) return pts;
    const groups = new Map();
    for (const p of pts) {
      const arr = groups.get(p.groupKey) || [];
      arr.push(p);
      groups.set(p.groupKey, arr);
    }
    const out = [];
    for (const arr of groups.values()) {
      if (arr.length === 1) {
        out.push(arr[0]);
        continue;
      }
      const n = arr.length;
      const half = (n - 1) / 2;
      const stepMs = 30 * 60 * 1000; // 30 minutes between points
      // Sort consistently by instance name for stable ordering
      arr.sort((a, b) => String(a.instance).localeCompare(String(b.instance)));
      arr.forEach((p, idx) => {
        const k = idx - half;
        const base = p.x0 || p.x;
        const nx = new Date(base.getTime() + k * stepMs);
        out.push({ ...p, x: nx, x0: base });
      });
    }
    // Keep order by time
    out.sort((a, b) => a.x - b.x);
    return out;
  };

  // Compress same-day/value points into one, aggregating instance names
  const compressGroupedPoints = (pts) => {
    if (!pts.length) return pts;
    const byKey = new Map();
    for (const p of pts) {
      const arr = byKey.get(p.groupKey) || [];
      arr.push(p);
      byKey.set(p.groupKey, arr);
    }
    const out = [];
    for (const arr of byKey.values()) {
      if (arr.length === 1) { out.push(arr[0]); continue; }
      const avgMs = Math.round(arr.reduce((s, p) => s + (p.x0 ? p.x0.getTime() : p.x.getTime()), 0) / arr.length);
      const x = new Date(avgMs);
      const y = arr[0].y; // same by group definition
      const uniqInstances = Array.from(new Set(arr.map((p) => p.instance).filter(Boolean)));
      const instanceLabel = uniqInstances.length <= 3 ? uniqInstances.join(", ") : `${uniqInstances.length} inst`;
      out.push({ ...arr[0], x, y, instance: instanceLabel });
    }
    out.sort((a, b) => a.x - b.x);
    return out;
  };

  const isMaskCombined = propertyName === "Mask/Unmask";
  const pointsA = useMemo(() => {
    const base = makePoints(recordsA);
    return isMaskCombined ? compressGroupedPoints(base) : jitterGroupedPoints(base);
  }, [recordsA, objectType, propertyName, objectInstance, selectedUnitSystemId, rangeMin, rangeMax]);
  const pointsB = useMemo(() => {
    const base = makePoints(recordsB);
    return isMaskCombined ? compressGroupedPoints(base) : jitterGroupedPoints(base);
  }, [recordsB, objectType, propertyName, objectInstance, selectedUnitSystemId, rangeMin, rangeMax]);

  const chartData = useMemo(() => {
    const sameSet = eventA && eventB && String(eventA) === String(eventB);

    const baseA = { bg: "rgba(75, 192, 192, 0.7)", bd: "rgba(75, 192, 192, 1)" };
    const baseB = { bg: "rgba(255, 99, 132, 0.7)", bd: "rgba(255, 99, 132, 1)" };

    if (sameSet) {
      return {
        datasets: [
          {
            label: componentAName || "Event A",
            data: pointsA,
            backgroundColor: "rgba(0,0,0,0.7)",
            borderColor: "rgba(0,0,0,1)",
            pointRadius: 3,
            showLine: false,
          },
          {
            label: componentBName || "Event B",
            data: pointsB,
            backgroundColor: "rgba(0,0,0,0.7)",
            borderColor: "rgba(0,0,0,1)",
            pointRadius: 3,
            showLine: false,
          },
        ],
      };
    }

    // Build merged 'Similar' dataset and remove overlaps from A/B
    const keysB = new Set(pointsB.map((p) => p.groupKey));
    const keysA = new Set(pointsA.map((p) => p.groupKey));
    const intersectKeys = new Set([...keysA].filter((k) => keysB.has(k)));

    const onlyA = pointsA.filter((p) => !intersectKeys.has(p.groupKey));
    const onlyB = pointsB.filter((p) => !intersectKeys.has(p.groupKey));

    const byKeyA = new Map();
    for (const p of pointsA) {
      if (!byKeyA.has(p.groupKey)) byKeyA.set(p.groupKey, []);
      byKeyA.get(p.groupKey).push(p);
    }
    const byKeyB = new Map();
    for (const p of pointsB) {
      if (!byKeyB.has(p.groupKey)) byKeyB.set(p.groupKey, []);
      byKeyB.get(p.groupKey).push(p);
    }
    const similarPoints = [];
    for (const k of intersectKeys) {
      const aArr = byKeyA.get(k) || [];
      const bArr = byKeyB.get(k) || [];
      const all = [...aArr, ...bArr];
      if (all.length === 0) continue;
      const avgMs = Math.round(all.reduce((s, p) => s + (p.x0 ? p.x0.getTime() : p.x.getTime()), 0) / all.length);
      const x = new Date(avgMs);
      const y = all[0].y;
      const uniqInstances = Array.from(new Set(all.map((p) => p.instance).filter(Boolean)));
      const instanceLabel = uniqInstances.length <= 3 ? uniqInstances.join(", ") : `${uniqInstances.length} inst`;
      similarPoints.push({ x, y, instance: instanceLabel, groupKey: k });
    }

    return {
      datasets: [
        {
          label: componentAName || "Event A",
          data: onlyA,
          backgroundColor: baseA.bg,
          borderColor: baseA.bd,
          pointRadius: 3,
          showLine: false,
        },
        {
          label: componentBName || "Event B",
          data: onlyB,
          backgroundColor: baseB.bg,
          borderColor: baseB.bd,
          pointRadius: 3,
          showLine: false,
        },
        {
          label: "Similar",
          data: similarPoints,
          backgroundColor: "rgba(0,0,0,0.7)",
          borderColor: "rgba(0,0,0,1)",
          pointRadius: 4,
          showLine: false,
        },
      ],
    };
  }, [pointsA, pointsB, componentAName, componentBName, eventA, eventB]);

  const unitLabel = getUnitForProperty(propertyName);
  const allForDomain = useMemo(() => [...pointsA, ...pointsB], [pointsA, pointsB]);
  const computedMin = useMemo(() => {
    if (!allForDomain.length) return undefined;
    return new Date(Math.min(...allForDomain.map((p) => (p.x instanceof Date ? p.x.getTime() : new Date(p.x).getTime()))));
  }, [allForDomain]);
  const computedMax = useMemo(() => {
    if (!allForDomain.length) return undefined;
    return new Date(Math.max(...allForDomain.map((p) => (p.x instanceof Date ? p.x.getTime() : new Date(p.x).getTime()))));
  }, [allForDomain]);
  const parseDateSafe = (s, endOfDay = false) => {
    if (!s) return undefined;
    // Accept only full YYYY-MM-DD to avoid partial input breaking the scale
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
    const iso = endOfDay ? `${s}T23:59:59` : `${s}T00:00:00`;
    const d = new Date(iso);
    return isNaN(d) ? undefined : d;
  };
  const fallbackMin = useMemo(() => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), []);
  const fallbackMax = useMemo(() => new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), []);
  // Initial bounds: user input (only if fully formed), else data bounds, else sane fallbacks
  let minBound = parseDateSafe(rangeMin, false) || computedMin || fallbackMin;
  let maxBound = parseDateSafe(rangeMax, true) || computedMax || fallbackMax;
  // Clamp to a safe calendar range and ensure min <= max to avoid Chart.js errors while typing
  const clampMin = new Date("1900-01-01T00:00:00");
  const clampMax = new Date("2200-01-01T00:00:00");
  if (minBound && minBound < clampMin) minBound = clampMin;
  if (maxBound && maxBound > clampMax) maxBound = clampMax;
  if (minBound && maxBound && maxBound < minBound) {
    // If user typed only year/month temporarily, keep a small 1-day window
    maxBound = new Date(minBound.getTime() + 24 * 60 * 60 * 1000);
  }

  const diffMs = useMemo(() => (minBound && maxBound ? (maxBound - minBound) : 0), [minBound, maxBound]);
  const diffDays = useMemo(() => Math.max(0, diffMs / (24 * 60 * 60 * 1000)), [diffMs]);
  const timeUnit = useMemo(() => {
    if (diffDays > 365 * 5) return 'year';
    if (diffDays > 60) return 'month';
    return 'day';
  }, [diffDays]);
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
          title: (items) => {
            const it = items?.[0];
            if (!it) return "";
            const d = it.parsed?.x ? new Date(it.parsed.x) : null;
            return d ? d.toLocaleString() : "";
          },
          label: (ctx) => {
            const inst = ctx.raw?.instance ? ` - ${ctx.raw.instance}` : "";
            const val = ctx.parsed?.y;
            const unit = unitLabel ? ` ${unitLabel}` : "";
            return `${ctx.dataset.label}${inst}: ${val}${unit}`;
          },
        },
      },
      instanceLabels: { show: showLabels },
    },
    scales: {
      x: {
        type: "time",
        time: { unit: timeUnit },
        title: { display: true, text: "Time" },
        min: minBound,
        max: maxBound,
      },
      y: {
        type: "linear",
        title: { display: true, text: unitLabel || "Value" },
        ticks: { beginAtZero: false },
      },
    },
  }), [propertyName, unitLabel, minBound, maxBound, timeUnit, showLabels]);

  // No auto-setting of date ranges; user selects Date From/To manually

  if (loading) return <Spinner animation="border" />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <div className="ds-card p-4">
      <Card.Body>
        <h4 className="ds-heading">Compare Events by Property</h4>
        {/* Top controls grouped by 3 per row */}
        <Row className="g-2 mb-2">
          <Col md={4} sm={6} xs={12}>
            <Form.Group className="mb-0">
              <Form.Label className="small fw-semibold">Event A</Form.Label>
              <Form.Select className="ds-input" size="sm" value={eventA} onChange={(e) => setEventA(e.target.value)}>
                <option value="">Select event set...</option>
                {eventsComponents.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4} sm={6} xs={12}>
            <Form.Group className="mb-0">
              <Form.Label className="small fw-semibold">Object Type</Form.Label>
              <Form.Select className="ds-input" size="sm" value={objectType}
                onChange={(e) => { setObjectType(e.target.value); setPropertyName(""); setObjectInstance(""); }}>
                <option value="">Select object type...</option>
                {metaTypes.map((t) => (<option key={t.id} value={t.name}>{t.name}</option>))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4} sm={6} xs={12}>
            <Form.Group className="mb-0">
              <Form.Label className="small fw-semibold">Date From</Form.Label>
              <Form.Control className="ds-input" size="sm" type="date" value={rangeMin || ""}
                onChange={(e) => { setRangeMin(e.target.value || null); }} />
            </Form.Group>
          </Col>
          
        </Row>

        <Row className="g-2 mb-2">
          <Col md={4} sm={6} xs={12}>
            <Form.Group className="mb-0">
              <Form.Label className="small fw-semibold">Event B</Form.Label>
              <Form.Select className="ds-input" size="sm" value={eventB} onChange={(e) => setEventB(e.target.value)}>
                <option value="">Select event set...</option>
                {eventsComponents.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </Form.Select>
            </Form.Group>
          </Col>
          
          <Col md={4} sm={6} xs={12}>
            <Form.Group className="mb-0">
              <Form.Label className="small fw-semibold">Property</Form.Label>
              <Form.Select className="ds-input" size="sm" value={propertyName} onChange={(e) => setPropertyName(e.target.value)} disabled={!objectType}>
                <option value="">Select property...</option>
                {propertyOptions.map((p) => (<option key={p.id} value={p.name}>{p.name}</option>))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4} sm={6} xs={12}>
            <Form.Group className="mb-0">
              <Form.Label className="small fw-semibold">Date To</Form.Label>
              <Form.Control className="ds-input" size="sm" type="date" value={rangeMax || ""}
                onChange={(e) => { setRangeMax(e.target.value || null); }} />
            </Form.Group>
          </Col>
        </Row>

        <Row className="g-2 mb-2">
          <Col md={4} sm={6} xs={12}>
            <Form.Group className="mb-0">
              <Form.Label className="small fw-semibold">Unit System</Form.Label>
              <Form.Select className="ds-input" size="sm" value={selectedUnitSystemId || ""} onChange={(e) => setSelectedUnitSystemId(Number(e.target.value) || null)}>
                {unitSystemMappings.map((s) => (<option key={s.unit_system_id} value={s.unit_system_id}>{s.unit_system_name}</option>))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4} sm={6} xs={12}>
            <Form.Group className="mb-0">
              <Form.Label className="small fw-semibold">Instance (optional)</Form.Label>
              <Form.Select className="ds-input" size="sm" value={objectInstance} onChange={(e) => setObjectInstance(e.target.value)} disabled={!objectType}>
                <option value="">All instances</option>
                {instanceOptions.map((i) => (<option key={i.id} value={i.name}>{i.name}</option>))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4} sm={12} xs={12}>
            <div className="d-flex align-items-center gap-3 h-100 pt-4 pt-md-0">
              <Form.Check type="switch" id="showLabelsSwitch" label="Show names" checked={showLabels}
                onChange={() => setShowLabels((v) => !v)} className="brand-switch fw-semibold" />
              <Button size="sm" variant="none" className="btn-ghost" onClick={() => { setRangeMin(null); setRangeMax(null); }}>
                Reset Range
              </Button>
            </div>
          </Col>
        </Row>
        <div className="mb-3" />
        {/* Bottom chart */}
        <div style={{ minHeight: 320 }}>
          <Scatter data={chartData} options={chartOptions} height={100} />
        </div>
      </Card.Body>
    </div>
  );
}
