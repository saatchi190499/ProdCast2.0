import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import api from "../../utils/axiosInstance";
import { Card, Button, Form, Spinner, Alert, Modal } from "react-bootstrap";
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

export default function VisualAnalysisBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedScenarioIds, setSelectedScenarioIds] = useState([]); // string ids

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [componentName, setComponentName] = useState("");
  const [records, setRecords] = useState([]);

  const [types, setTypes] = useState([]);
  const [instancesMap, setInstancesMap] = useState({});
  const [propertiesMap, setPropertiesMap] = useState({});
  const [scenarios, setScenarios] = useState([]);
  // Unit systems
  const [unitSystems, setUnitSystems] = useState([]); // [{id, name}]
  const [unitMapBySystem, setUnitMapBySystem] = useState({}); // sysId -> { propId -> {unit, scale_factor, offset} }
  const [selectedUnitSystemId, setSelectedUnitSystemId] = useState(null);

  const [selectedType, setSelectedType] = useState("");
  const [selectedProperty, setSelectedProperty] = useState("");
  const [selectedProperties, setSelectedProperties] = useState([]);
  const [selectedInstances, setSelectedInstances] = useState([]);
  const isScenarioCompare = selectedScenarioIds.length > 1;
  const [dataLoading, setDataLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [autoFetched, setAutoFetched] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [defaultInstanceByType, setDefaultInstanceByType] = useState({});

  // Layout and per-panel selection
  const [layoutKey, setLayoutKey] = useState("1x1"); // 1x1, 2x2, 2x3
  const layoutMap = { "1x1": { rows: 1, cols: 1 }, "2x2": { rows: 2, cols: 2 }, "2x3": { rows: 2, cols: 3 } };
  const grid = layoutMap[layoutKey];
  const [panels, setPanels] = useState([]); // [{ type, property, instances }]

  // Modal for per-panel object selection
  const [showPanelModal, setShowPanelModal] = useState(false);
  const [activePanelIndex, setActivePanelIndex] = useState(null);
  const [modalInstances, setModalInstances] = useState([]);
  const [modalType, setModalType] = useState("");
  const [modalProperty, setModalProperty] = useState("");
  const [modalProperties, setModalProperties] = useState([]);

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  // Initialize selected scenarios from URL once (supports scenarioIds or legacy scenarioId)
  useEffect(() => {
    const idsParam = searchParams.get("scenarioIds") || searchParams.get("scenarioId");
    if (idsParam) {
      const ids = String(idsParam)
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
      setSelectedScenarioIds(ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load scenarios list for selector
  useEffect(() => {
    const loadScenarios = async () => {
      try {
        const scRes = await api.get(`/scenarios/all/`);
        const all = scRes.data || [];
        // Hide scenarios with ERROR status from the selector
        const filtered = all.filter(s => String(s.status).toUpperCase() !== "ERROR");
        setScenarios(filtered);
      } catch (e) {
        console.warn("Failed to load scenarios", e);
      }
    };
    loadScenarios();
  }, []);

  // Load unit systems + property mappings
  useEffect(() => {
    const loadUnits = async () => {
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
      } catch (e) {
        console.warn("Unit mapping load failed", e);
      }
    };
    loadUnits();
  }, []);

  // After config is loaded, if no unit system picked yet, pick the first
  useEffect(() => {
    if (configLoaded && !selectedUnitSystemId && unitSystems.length > 0) {
      setSelectedUnitSystemId(unitSystems[0].id);
    }
  }, [configLoaded, selectedUnitSystemId, unitSystems]);

  // Load persisted default instance mapping
  useEffect(() => {
    try {
      const raw = localStorage.getItem("va_defaultInstanceByType");
      if (raw) setDefaultInstanceByType(JSON.parse(raw));
    } catch {}
  }, []);

  const getDefaultInstance = (typeName) => {
    const mapped = defaultInstanceByType?.[typeName];
    if (mapped) return mapped;
    const list = instancesMap[typeName] || [];
    return list[0]?.name || "";
  };

  const toLocalInput = (s) => {
    if (!s) return s;
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    const offsetMs = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
  };

  const getPropertyUnit = (typeName, propName) => {
    const propsList = propertiesMap[typeName] || [];
    const pObj = propsList.find(x => x.name === propName);
    if (!pObj) return "";
    const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
    const unitFromMap = pObj.id ? (sysMap[pObj.id]?.unit || "") : "";
    return unitFromMap || pObj.unit || "";
  };

  const withAliasAndUnit = (typeName, propName) => {
    const propsList = propertiesMap[typeName] || [];
    const pObj = propsList.find(x => x.name === propName);
    const alias = pObj && (pObj.alias || pObj.alias_text);
    const unit = getPropertyUnit(typeName, propName);
    const nameWithAlias = alias ? `${propName} (${alias})` : propName;
    return unit ? `${nameWithAlias} [${unit}]` : nameWithAlias;
  };

  // When one or more scenarios, enforce a single selected instance for global 1x1 mode
  useEffect(() => {
    const oneOrMoreScenarios = selectedScenarioIds.length >= 1;
    if (oneOrMoreScenarios && grid.rows * grid.cols === 1) {
      if (selectedInstances.length !== 1) {
        const def = getDefaultInstance(selectedType);
        setSelectedInstances(def ? [def] : []);
      }
    }
  }, [selectedScenarioIds.length, selectedType, instancesMap, selectedInstances.length, grid.rows, grid.cols]);

  // Keep panels array in sync with layout (retain previous selections if possible)
  useEffect(() => {
    const target = grid.rows * grid.cols;
    setPanels(prev => Array.from({ length: target }, (_, i) => {
      const prevPanel = prev?.[i] || {};
      const pType = prevPanel.type || selectedType || "";
      const pProp = prevPanel.property || selectedProperty || "";
      let pInst = prevPanel.instances || [];
      if (isScenarioCompare && pInst.length === 0 && pType) {
        const def = getDefaultInstance(pType);
        pInst = def ? [def] : [];
      }
      return { type: pType, property: pProp, instances: pInst };
    }));
  }, [layoutKey, selectedType, selectedProperty, isScenarioCompare, instancesMap, defaultInstanceByType]);

  // Initial load: fetch metadata and component name, set defaults; do not load records until user clicks Fetch
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        try {
          const compRes = await api.get(`/components/${id}/`);
          setComponentName(compRes.data?.name ?? "Component");
        } catch {}

        const metaRes = await api.get("/object-metadata/");
        const t = metaRes.data.types;
        const inst = metaRes.data.instances;
        const props = metaRes.data.properties;
        setTypes(t);
        setInstancesMap(inst);
        setPropertiesMap(props);

        if (t.length > 0) {
          const defType = t[0].name;
          setSelectedType(defType);
          const propList = props[defType] || [];
          if (propList.length > 0) {
            setSelectedProperty(propList[0].name);
            setSelectedProperties([propList[0].name]);
          }
          const instList = inst[defType] || [];
          setSelectedInstances(instList.slice(0, 3).map(x => x.name));
        }

        const now = new Date();
        const ago = new Date(now);
        ago.setDate(now.getDate() - 30);
        const toLocalIso = (d) => {
          const offsetMs = d.getTimezoneOffset() * 60000;
          return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
        };
        setStart(toLocalIso(ago));
        setEnd(toLocalIso(now));
      } catch (e) {
        console.error(e);
        setError("Failed to load visual analysis data");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id]);

  const fetchData = async () => {
    setDataLoading(true);
    setHasFetched(true);
    try {
      if (selectedScenarioIds.length > 0) {
        const params = {};
        if (start) params.start = start;
        if (end) params.end = end;
        const results = await Promise.all(
          selectedScenarioIds.map(sid => api.get(`/scenarios/${sid}/results/`, { params }))
        );
        const allRecs = results.flatMap(r => (r.data && r.data.records) || []);
        setRecords(allRecs);
        const names = Array.from(new Set(results
          .map(r => r.data && r.data.scenario && r.data.scenario.scenario_name)
          .filter(Boolean)));
        setComponentName(names.length ? names.join(", ") : "Scenarios");
      } else {
        const recRes = await api.get(`/components/events/${id}`);
        setRecords(recRes.data || []);
      }
    } catch (e) {
      console.error(e);
      setError("Failed to fetch records");
    } finally {
      setDataLoading(false);
    }
  };

  // Auto-fetch once after metadata + config load
  useEffect(() => {
    if (!loading && configLoaded && !dataLoading && !autoFetched) {
      fetchData().finally(() => setAutoFetched(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, configLoaded]);

  // Load existing VisualAnalysisConfig and apply to UI
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await api.get(`/components/visual-analysis/${id}/config/`);
        const cfg = (res.data && res.data.charts && res.data.charts[0]) || null;
        if (!cfg) { setConfigLoaded(true); return; }
        if (cfg.layout) setLayoutKey(cfg.layout);
        if (Array.isArray(cfg.scenarios)) setSelectedScenarioIds(cfg.scenarios.map(String));
        if (cfg.start) setStart(toLocalInput(cfg.start));
        if (cfg.end) setEnd(toLocalInput(cfg.end));
        if (cfg.unit_system_id) setSelectedUnitSystemId(cfg.unit_system_id);
        if (Array.isArray(cfg.panels)) {
          setPanels(cfg.panels.map(p => ({
            type: p.type || "",
            property: p.property || (Array.isArray(p.properties) && p.properties[0]) || "",
            properties: Array.isArray(p.properties) ? p.properties : (p.property ? [p.property] : []),
            instances: Array.isArray(p.instances) ? p.instances : [],
            start: p.start ? toLocalInput(p.start) : undefined,
            end: p.end ? toLocalInput(p.end) : undefined,
            unit_system_id: p.unit_system_id ?? undefined,
          })));
        }
        setConfigLoaded(true);
      } catch (e) {
        console.warn("Failed to load visual config", e);
        setConfigLoaded(true);
      }
    };
    loadConfig();
  }, [id]);

  const saveConfig = async () => {
    try {
      const payload = {
        charts: [
          {
            layout: layoutKey,
            scenarios: selectedScenarioIds,
            start,
            end,
            unit_system_id: selectedUnitSystemId,
            panels: (panels || []).map(p => ({
              type: p.type || "",
              property: p.property || (Array.isArray(p.properties) && p.properties[0]) || "",
              properties: Array.isArray(p.properties) ? p.properties : (p.property ? [p.property] : []),
              instances: Array.isArray(p.instances) ? p.instances : [],
              start: p.start || undefined,
              end: p.end || undefined,
              unit_system_id: p.unit_system_id ?? undefined,
            })),
          },
        ],
      };
      await api.put(`/components/visual-analysis/${id}/config/`, payload);
    } catch (e) {
      console.error("Failed to save visual config", e);
      setError("Failed to save configuration");
    }
  };

  // Build series for global (1x1) mode
  const preparedSeries = useMemo(() => {
    if (!selectedType || (!selectedProperty && selectedScenarioIds.length !== 1)) return { mode: "instance", seriesMap: {} };
    const startTs = start ? new Date(start).getTime() : null;
    const endTs = end ? new Date(end).getTime() : null;

    const typeIdByName = Object.fromEntries(types.map(t => [t.name, t.id]));
    const thisTypeId = typeIdByName[selectedType];
    const instList = instancesMap[selectedType] || [];
    const propsList = propertiesMap[selectedType] || [];

    if (isScenarioCompare) {
      const instNameSel = selectedInstances[0];
      const nameByScenarioId = Object.fromEntries((scenarios || []).map(s => [s.scenario_id, s.scenario_name]));
      const pointsByScenario = {};
      const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
      const selectedPropId = propsList.find(x => x.name === selectedProperty)?.id;
      const conv = selectedPropId ? sysMap[selectedPropId] : null;
      for (const r of records) {
        if (r.object_type !== thisTypeId) continue;
        const instName = instList.find(x => x.id === r.object_instance)?.name;
        const propName = propsList.find(x => x.id === r.object_type_property)?.name;
        if (!instName || !propName) continue;
        if (propName !== selectedProperty) continue;
        if (!instNameSel || instName !== instNameSel) continue;
        if (!r.date_time) continue;
        const t = new Date(r.date_time);
        if (isNaN(t.getTime())) continue;
        if (startTs && t.getTime() < startTs) continue;
        if (endTs && t.getTime() > endTs) continue;
        let y = Number(r.value);
        if (conv) y = y * Number(conv.scale_factor ?? 1) + Number(conv.offset ?? 0);
        if (!isFinite(y)) continue;
        const scenId = r.scenario || "unknown";
        const label = nameByScenarioId[scenId] || `Scenario ${scenId}`;
        if (!pointsByScenario[label]) pointsByScenario[label] = [];
        pointsByScenario[label].push({ x: t, y });
      }
      for (const k of Object.keys(pointsByScenario)) {
        pointsByScenario[k].sort((a, b) => a.x - b.x);
      }
      return { mode: "scenario", seriesMap: pointsByScenario };
    }

    if (selectedScenarioIds.length === 1) {
      // Single scenario: multiple properties for one instance
      const instNameSel = selectedInstances[0];
      const selProps = (selectedProperties && selectedProperties.length > 0) ? selectedProperties : (selectedProperty ? [selectedProperty] : []);
      const pointsByProperty = {};
      const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
      for (const r of records) {
        if (r.object_type !== thisTypeId) continue;
        const instName = instList.find(x => x.id === r.object_instance)?.name;
        const propName = propsList.find(x => x.id === r.object_type_property)?.name;
        if (!instName || !propName) continue;
        if (!instNameSel || instName !== instNameSel) continue;
        if (!selProps.includes(propName)) continue;
        if (!r.date_time) continue;
        const t = new Date(r.date_time);
        if (isNaN(t.getTime())) continue;
        if (startTs && t.getTime() < startTs) continue;
        if (endTs && t.getTime() > endTs) continue;
        const propId = propsList.find(x => x.name === propName)?.id;
        const conv = propId ? sysMap[propId] : null;
        let y = Number(r.value);
        if (conv) y = y * Number(conv.scale_factor ?? 1) + Number(conv.offset ?? 0);
        if (!isFinite(y)) continue;
        if (!pointsByProperty[propName]) pointsByProperty[propName] = [];
        pointsByProperty[propName].push({ x: t, y });
      }
      for (const k of Object.keys(pointsByProperty)) {
        pointsByProperty[k].sort((a, b) => a.x - b.x);
      }
      return { mode: "property", seriesMap: pointsByProperty };
    }

    const selectedSet = new Set(selectedInstances || []);
    const pointsByInstance = {};
    const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
    const selectedPropId = propsList.find(x => x.name === selectedProperty)?.id;
    const conv = selectedPropId ? sysMap[selectedPropId] : null;
    for (const r of records) {
      if (r.object_type !== thisTypeId) continue;
      const instName = instList.find(x => x.id === r.object_instance)?.name;
      const propName = propsList.find(x => x.id === r.object_type_property)?.name;
      if (!instName || !propName) continue;
      if (propName !== selectedProperty) continue;
      if (selectedSet.size > 0 && !selectedSet.has(instName)) continue;
      if (!r.date_time) continue;
      const t = new Date(r.date_time);
      if (isNaN(t.getTime())) continue;
      if (startTs && t.getTime() < startTs) continue;
      if (endTs && t.getTime() > endTs) continue;
      let y = Number(r.value);
      if (conv) y = y * Number(conv.scale_factor ?? 1) + Number(conv.offset ?? 0);
      if (!isFinite(y)) continue;
      if (!pointsByInstance[instName]) pointsByInstance[instName] = [];
      pointsByInstance[instName].push({ x: t, y });
    }
    for (const k of Object.keys(pointsByInstance)) {
      pointsByInstance[k].sort((a, b) => a.x - b.x);
    }
    return { mode: "instance", seriesMap: pointsByInstance };
  }, [records, types, instancesMap, propertiesMap, selectedType, selectedProperty, selectedProperties, selectedInstances, start, end, isScenarioCompare, selectedScenarioIds.length, selectedUnitSystemId, unitMapBySystem, scenarios]);

  // Build series for a given set of instance names (per-panel)
  const buildSeriesForPanel = (panelCfg) => {
    const typeName = panelCfg?.type || selectedType;
    const propertyName = panelCfg?.property || selectedProperty;
    const propertyNames = (panelCfg?.properties && panelCfg.properties.length > 0) ? panelCfg.properties : (propertyName ? [propertyName] : []);
    const instanceNames = panelCfg?.instances || [];
    if (!typeName || propertyNames.length === 0) return { mode: "instance", seriesMap: {} };
    const startTs = start ? new Date(start).getTime() : null;
    const endTs = end ? new Date(end).getTime() : null;

    const typeIdByName = Object.fromEntries(types.map(t => [t.name, t.id]));
    const thisTypeId = typeIdByName[typeName];
    const instList = instancesMap[typeName] || [];
    const propsList = propertiesMap[typeName] || [];

    if (isScenarioCompare) {
      const instNameSel = instanceNames && instanceNames[0];
      const nameByScenarioId = Object.fromEntries((scenarios || []).map(s => [s.scenario_id, s.scenario_name]));
      const pointsByScenario = {};
      const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
      // scenario compare: we expect single property; if multiple passed, we include all
      for (const r of records) {
        if (r.object_type !== thisTypeId) continue;
        const instName = instList.find(x => x.id === r.object_instance)?.name;
        const propName = propsList.find(x => x.id === r.object_type_property)?.name;
        if (!instName || !propName) continue;
        if (propertyNames.length > 0 && !propertyNames.includes(propName)) continue;
        if (!instNameSel || instName !== instNameSel) continue;
        if (!r.date_time) continue;
        const t = new Date(r.date_time);
        if (isNaN(t.getTime())) continue;
        if (startTs && t.getTime() < startTs) continue;
        if (endTs && t.getTime() > endTs) continue;
        const propId = propsList.find(x => x.name === propName)?.id;
        const conv = propId ? sysMap[propId] : null;
        let y = Number(r.value);
        if (conv) y = y * Number(conv.scale_factor ?? 1) + Number(conv.offset ?? 0);
        if (!isFinite(y)) continue;
        const scenId = r.scenario || "unknown";
        const label = nameByScenarioId[scenId] || `Scenario ${scenId}`;
        if (!pointsByScenario[label]) pointsByScenario[label] = [];
        pointsByScenario[label].push({ x: t, y });
      }
      for (const k of Object.keys(pointsByScenario)) {
        pointsByScenario[k].sort((a, b) => a.x - b.x);
      }
      return { mode: "scenario", seriesMap: pointsByScenario };
    }

    // Determine rendering mode for panels: multi-properties vs multi-instances
    const multiProps = propertyNames.length > 1;
    const multiInsts = (instanceNames || []).length > 1;
    if (multiProps && !multiInsts && (instanceNames || []).length === 1) {
      // Series per property for a single instance
      const instNameSel = instanceNames[0];
      const pointsByProperty = {};
      const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
      for (const r of records) {
        if (r.object_type !== thisTypeId) continue;
        const instName = instList.find(x => x.id === r.object_instance)?.name;
        const propName = propsList.find(x => x.id === r.object_type_property)?.name;
        if (!instName || !propName) continue;
        if (!propertyNames.includes(propName)) continue;
        if (!instNameSel || instName !== instNameSel) continue;
        if (!r.date_time) continue;
        const t = new Date(r.date_time);
        if (isNaN(t.getTime())) continue;
        if (startTs && t.getTime() < startTs) continue;
        if (endTs && t.getTime() > endTs) continue;
        const propId = propsList.find(x => x.name === propName)?.id;
        const conv = propId ? sysMap[propId] : null;
        let y = Number(r.value);
        if (conv) y = y * Number(conv.scale_factor ?? 1) + Number(conv.offset ?? 0);
        if (!isFinite(y)) continue;
        if (!pointsByProperty[propName]) pointsByProperty[propName] = [];
        pointsByProperty[propName].push({ x: t, y });
      }
      for (const k of Object.keys(pointsByProperty)) {
        pointsByProperty[k].sort((a, b) => a.x - b.x);
      }
      return { mode: "property", seriesMap: pointsByProperty };
    }

    // Series per instance for a single property
    const selectedSet = new Set(instanceNames || []);
    const oneProperty = propertyNames[0];
    const pointsByInstance = {};
    const sysMap2 = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
    for (const r of records) {
      if (r.object_type !== thisTypeId) continue;
      const instName = instList.find(x => x.id === r.object_instance)?.name;
      const propName = propsList.find(x => x.id === r.object_type_property)?.name;
      if (!instName || !propName) continue;
      if (propName !== oneProperty) continue;
      if (selectedSet.size > 0 && !selectedSet.has(instName)) continue;
      if (!r.date_time) continue;
      const t = new Date(r.date_time);
      if (isNaN(t.getTime())) continue;
      if (startTs && t.getTime() < startTs) continue;
      if (endTs && t.getTime() > endTs) continue;
      const propId = propsList.find(x => x.name === oneProperty)?.id;
      const conv2 = propId ? sysMap2[propId] : null;
      let y = Number(r.value);
      if (conv2) y = y * Number(conv2.scale_factor ?? 1) + Number(conv2.offset ?? 0);
      if (!isFinite(y)) continue;
      if (!pointsByInstance[instName]) pointsByInstance[instName] = [];
      pointsByInstance[instName].push({ x: t, y });
    }
    for (const k of Object.keys(pointsByInstance)) {
      pointsByInstance[k].sort((a, b) => a.x - b.x);
    }
    return { mode: "instance", seriesMap: pointsByInstance };
  };

  const chartData = useMemo(() => {
    const entries = Object.entries(preparedSeries.seriesMap);
    const datasets = entries.map(([label, pts], idx) => ({
      label,
      data: pts,
      borderColor: COLORS[idx % COLORS.length],
      backgroundColor: `${COLORS[idx % COLORS.length]}33`,
      borderWidth: 2,
      tension: 0.2,
      fill: false,
      pointRadius: 2,
    }));
    return { datasets };
  }, [preparedSeries]);

  const chartTitle = (() => {
    const base = `${selectedProperty || "Property"} — ${isScenarioCompare ? "Scenario Comparison" : componentName}`;
    const instLabel = isScenarioCompare
      ? (selectedInstances[0] || "")
      : (selectedInstances && selectedInstances.length > 0 ? selectedInstances.join(", ") : "");
    return instLabel ? `${base} — ${instLabel}` : base;
  })();

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: "time",
        time: { tooltipFormat: "dd/MM/yyyy HH:mm" },
        ticks: { autoSkip: true, maxTicksLimit: 10 },
      },
      y: { beginAtZero: false },
    },
    plugins: {
      legend: { display: true, position: "top" },
      title: { display: true, text: chartTitle },
      tooltip: { mode: "nearest", intersect: false },
    },
  };

  const availableInstances = useMemo(() => (instancesMap[selectedType] || []).map(x => x.name), [instancesMap, selectedType]);
  const availableProps = useMemo(() => (propertiesMap[selectedType] || []).map(x => x.name), [propertiesMap, selectedType]);

  if (loading) return <Spinner animation="border" />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h3 className="ds-title" style={{ margin: 0 }}>Visual Analysis — {componentName}</h3>
        <Button
          variant="none"
          className="btn-brand"
          onClick={() => navigate('/visual/VisualAnalysis')}
        >
          Back
        </Button>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
        <div style={{ flex: "0 0 280px" }}>
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
                  <Form.Label className="ds-title">Scenarios</Form.Label>
                  <Form.Select
                    multiple
                    className="ds-input form-select"
                    value={selectedScenarioIds}
                    onChange={(e) => {
                      const vals = Array.from(e.target.selectedOptions).map(o => o.value);
                      setSelectedScenarioIds(vals);
                      if (vals.length > 0) setSearchParams({ scenarioIds: vals.join(',') });
                      else setSearchParams({});
                    }}
                    style={{ height: 140 }}
                  >
                    {scenarios.map(s => (
                      <option key={s.scenario_id} value={String(s.scenario_id)}>{s.scenario_name}</option>
                    ))}
                  </Form.Select>
                </div>
                <div>
                  <Form.Label className="ds-title">Start</Form.Label>
                  <Form.Control type="datetime-local" className="ds-input" value={start} onChange={e => setStart(e.target.value)} />
                </div>
                <div>
                  <Form.Label className="ds-title">End</Form.Label>
                  <Form.Control type="datetime-local" className="ds-input" value={end} onChange={e => setEnd(e.target.value)} />
                </div>
                <div>
                  <Form.Label className="ds-title">Layout</Form.Label>
                  <Form.Select
                    className="ds-input form-select"
                    value={layoutKey}
                    onChange={e => setLayoutKey(e.target.value)}
                  >
                    <option value="1x1">1 x 1</option>
                    <option value="2x2">2 x 2</option>
                    <option value="2x3">2 x 3</option>
                  </Form.Select>
                </div>
                <div className="d-flex" style={{ gap: 8 }}>
                  <Button className="btn-brand flex-fill" onClick={fetchData} disabled={dataLoading}>
                    {dataLoading ? "Fetching..." : "Fetch"}
                  </Button>
                  <Button variant="outline-secondary" className="flex-fill" onClick={saveConfig}>
                    Save
                  </Button>
                </div>
              </div>
            </Card.Body>
          </Card>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Card>
            <Card.Body>
              {grid.rows * grid.cols > 1 ? (
                <div className="text-muted mb-2">Select per-panel Type, Properties, and Instances via each panel.</div>
              ) : (
                <div className="text-muted mb-2">Click the panel to choose Type, Properties (multi) and Instances.</div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${grid.cols}, 1fr)`, gap: 12 }}>
                  {Array.from({ length: grid.rows * grid.cols }).map((_, idx) => {
                    const panel = panels[idx] || { type: "", property: "", instances: [] };
                    const series = buildSeriesForPanel(panel);
                    const entries = Object.entries(series.seriesMap);
                    const data = {
                      datasets: entries.map(([label, pts], di) => {
                        let finalLabel = label;
                        if (series.mode === 'property') {
                          finalLabel = withAliasAndUnit(panel.type, label);
                        }
                        return {
                          label: finalLabel,
                          data: pts,
                          borderColor: COLORS[di % COLORS.length],
                          backgroundColor: `${COLORS[di % COLORS.length]}33`,
                          borderWidth: 2,
                          tension: 0.2,
                          fill: false,
                          pointRadius: 2,
                        };
                      })
                    };
                    const panelTitle = (() => {
                      const propLabel = (panel.properties && panel.properties.length > 0)
                        ? panel.properties.map(n => withAliasAndUnit(panel.type, n)).join(', ')
                        : withAliasAndUnit(panel.type, panel.property || 'Property');
                      const base = `${propLabel} — ${isScenarioCompare ? 'Scenario Comparison' : componentName}`;
                      const instLabel = isScenarioCompare
                        ? (panel.instances && panel.instances[0])
                        : ((panel.instances || []).length > 0 ? panel.instances.join(', ') : '');
                      return instLabel ? `${base} — ${instLabel}` : base;
                    })();
                    const panelOptions = {
                      ...chartOptions,
                      plugins: { ...chartOptions.plugins, title: { display: true, text: panelTitle } }
                    };
                    return (
                      <Card key={idx} style={{ minHeight: 280, position: 'relative' }}>
                        <Card.Body>
                          {dataLoading ? (
                            <div className="d-flex align-items-center" style={{ gap: 12 }}>
                              <Spinner animation="border" size="sm" />
                              <span>Fetching data…</span>
                            </div>
                          ) : (!panel.type || !panel.property || (panel.instances || []).length === 0) ? (
                            <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12, flexDirection: 'column' }}>
                              <div>No selection. Click to assign type, property and instances.</div>
                              <Button variant="outline-primary" onClick={() => {
                                setActivePanelIndex(idx);
                                const p = panels[idx] || {};
                                const initialType = p.type || selectedType || (types[0]?.name || "");
                                setModalType(initialType);
                                const props = propertiesMap[initialType] || [];
                                const initProp = p.property || (props[0]?.name || "");
                                setModalProperty(initProp);
                                setModalProperties(p.properties && p.properties.length > 0 ? p.properties : (initProp ? [initProp] : []));
                                setModalInstances(p.instances || []);
                                setShowPanelModal(true);
                              }}>
                                Assign to panel {idx + 1}
                              </Button>
                            </div>
                          ) : entries.length === 0 ? (
                            <Alert variant="info">No data for selected objects.</Alert>
                          ) : (
                            <div style={{ height: 280 }}>
                              <Line data={data} options={panelOptions} height={280} />
                            </div>
                          )}
                          <div style={{ position: 'absolute', top: 8, right: 8 }}>
                            <Button size="sm" variant="outline-secondary" onClick={() => {
                              setActivePanelIndex(idx);
                              const p = panels[idx] || {};
                              const initialType = p.type || selectedType || (types[0]?.name || "");
                              setModalType(initialType);
                              const props = propertiesMap[initialType] || [];
                              const initProp = p.property || (props[0]?.name || "");
                              setModalProperty(initProp);
                              setModalProperties(p.properties && p.properties.length > 0 ? p.properties : (initProp ? [initProp] : []));
                              if (isScenarioCompare) {
                                const def = p.instances?.[0] || getDefaultInstance(initialType);
                                setModalInstances(def ? [def] : []);
                              } else {
                                setModalInstances(p.instances || []);
                              }
                              
                              setShowPanelModal(true);
                            }}>Edit</Button>
                          </div>
                        </Card.Body>
                      </Card>
                    );
                  })}
              </div>
            </Card.Body>
          </Card>
        </div>
      </div>

      <Modal show={showPanelModal} onHide={() => setShowPanelModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Select type, properties and instances for panel {activePanelIndex != null ? activePanelIndex + 1 : ''}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex flex-column" style={{ gap: 12 }}>
            <div>
              <Form.Label className="ds-title">Type</Form.Label>
              <Form.Select
                className="ds-input form-select"
                value={modalType}
                onChange={(e) => {
                  const next = e.target.value;
                  setModalType(next);
                  const props = propertiesMap[next] || [];
                  setModalProperty(props[0]?.name || "");
                  setModalInstances(isScenarioCompare ? (getDefaultInstance(next) ? [getDefaultInstance(next)] : []) : []);
                }}
              >
                {types.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </Form.Select>
            </div>
            <div>
              <Form.Label className="ds-title">Properties</Form.Label>
              {isScenarioCompare ? (
                <Form.Select
                  className="ds-input form-select"
                  value={modalProperty}
                  onChange={(e) => { setModalProperty(e.target.value); setModalProperties(e.target.value ? [e.target.value] : []); }}
                  disabled={!modalType}
                >
                  {(propertiesMap[modalType] || []).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </Form.Select>
              ) : (
                <Form.Select
                  multiple
                  className="ds-input form-select"
                  value={modalProperties}
                  onChange={(e) => {
                    const vals = Array.from(e.target.selectedOptions).map(o => o.value);
                    // if multi properties chosen and multiple instances exist, trim instances to single
                    if (vals.length > 1 && (modalInstances || []).length > 1) {
                      setModalInstances([modalInstances[0]]);
                    }
                    setModalProperties(vals);
                    setModalProperty(vals[0] || "");
                  }}
                  disabled={!modalType}
                  style={{ height: 200 }}
                >
                  {(propertiesMap[modalType] || []).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </Form.Select>
              )}
            </div>
            <div>
              <Form.Label className="ds-title">Instances</Form.Label>
              {isScenarioCompare ? (
                <Form.Select
                  className="ds-input form-select"
                  value={modalInstances[0] || ''}
                  onChange={(e) => setModalInstances(e.target.value ? [e.target.value] : [])}
                  disabled={!modalType}
                >
                  {(instancesMap[modalType] || []).map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
                </Form.Select>
              ) : (
                ((modalProperties || []).length > 1 ? (
                  <Form.Select
                    className="ds-input form-select"
                    value={modalInstances[0] || ''}
                    onChange={(e) => setModalInstances(e.target.value ? [e.target.value] : [])}
                    disabled={!modalType}
                  >
                    {(instancesMap[modalType] || []).map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
                  </Form.Select>
                ) : (
                  <Form.Select
                    multiple
                    className="ds-input form-select"
                    value={modalInstances}
                    onChange={(e) => {
                      const vals = Array.from(e.target.selectedOptions).map(o => o.value);
                      // if multiple instances chosen and multiple properties are selected, reduce properties to single
                      if (vals.length > 1 && (modalProperties || []).length > 1) {
                        setModalProperties([modalProperty || (modalProperties[0] || "")].filter(Boolean));
                      }
                      setModalInstances(vals);
                    }}
                    disabled={!modalType}
                    style={{ height: 200 }}
                  >
                    {(instancesMap[modalType] || []).map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
                  </Form.Select>
                ))
              )}
            </div>
            
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowPanelModal(false)}>Cancel</Button>
          <Button
            className="btn-brand"
            onClick={() => {
              if (activePanelIndex != null) {
                setPanels(prev => prev.map((p, i) => i === activePanelIndex ? { ...p, type: modalType, property: modalProperty, properties: modalProperties, instances: modalInstances } : p));
                
              }
              setShowPanelModal(false);
            }}
          >
            Apply
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
