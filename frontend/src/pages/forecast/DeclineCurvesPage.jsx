import { useEffect, useMemo, useRef, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);
import { useParams, useNavigate } from "react-router-dom";
import api from "../../utils/axiosInstance";
import { Card, Table, Button, Form, Spinner, Alert } from "react-bootstrap";
import { saveAs } from "file-saver";
import Papa from "papaparse";
import { useTranslation } from "react-i18next";
import "../DataSourcePage.css";

export default function DeclineCurvesPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [componentName, setComponentName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [typeOptions, setTypeOptions] = useState([]);
  const [instanceOptionsByType, setInstanceOptionsByType] = useState({});
  const [propertyOptionsByType, setPropertyOptionsByType] = useState({});

  const [selectedInstance, setSelectedInstance] = useState("");
  const [selectedProps, setSelectedProps] = useState([]);
  const [rows, setRows] = useState([]); // Array of { [propName]: value }
  const [singleValues, setSingleValues] = useState({}); // single-value props

  const [existingMap, setExistingMap] = useState({});
  // existingMap structure: { instanceName: { propName: { data_set_id, value } } }

  const TANK = "TANK";
  const WELL = "WELL";

  // UI tab: TANK or WELL
  const [activeTab, setActiveTab] = useState(TANK);
  const [selectedWellInstance, setSelectedWellInstance] = useState("");
  const [rowsWell, setRowsWell] = useState([]); // WELL series rows
  const [singleValuesWell, setSingleValuesWell] = useState({}); // WELL single-value props

  // Unit systems
  const [unitSystems, setUnitSystems] = useState([]); // [{id, name}]
  const [unitMapBySystem, setUnitMapBySystem] = useState({}); // sysId -> { propId -> {unit, scale_factor, offset} }
  const [selectedUnitSystemId, setSelectedUnitSystemId] = useState(null);

  const tankInstances = useMemo(
    () => instanceOptionsByType[TANK] || [],
    [instanceOptionsByType]
  );
  const tankProperties = useMemo(
    () => propertyOptionsByType[TANK] || [],
    [propertyOptionsByType]
  );
  const wellInstances = useMemo(
    () => instanceOptionsByType[WELL] || [],
    [instanceOptionsByType]
  );
  const wellProperties = useMemo(
    () => propertyOptionsByType[WELL] || [],
    [propertyOptionsByType]
  );

  // WELL properties (IPR/ProdData category) of interest
  const wellIprProps = useMemo(() => {
    const want = new Set(["CumOilProd", "GORProd", "WCTProd"]);
    return (wellProperties || []).filter((p) => p?.category === "IPR/ProdData" && want.has(p.name));
  }, [wellProperties]);
  const wellPropIdByName = useMemo(() => Object.fromEntries((wellIprProps || []).map(p => [p.name, p.id])), [wellIprProps]);

  // Sync selectedProps with active tab
  useEffect(() => {
    if (activeTab === TANK) {
      const names = (tankProperties || []).map(p => p.name);
      setSelectedProps(names);
    } else if (activeTab === WELL) {
      const names = (wellIprProps || []).map(p => p.name);
      setSelectedProps(names);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tankProperties, wellIprProps]);

  const SINGLE_VALUE_PROPS = new Set([
    "CurrentGasProd",
    "FluidTemperature",
    "GasInPlace",
    "OilInPlace",
  ]);

  const toArray = (val) =>
    typeof val === "string"
      ? val.split("|").map((s) => s.trim())
      : Array.isArray(val)
        ? val
        : [];

  // Avoid float artifacts when converting numbers (e.g., 0.000199999999)
  const toRoundedString = (num, digits = 8) => {
    const n = Number(num);
    if (!isFinite(n)) return "";
    return String(Number(n.toFixed(digits)));
  };

  // Build chart data for XY: x = CumGasProd, y = ReservoirPressure
  const xKey = "CumGasProd";
  const yKey = "ReservoirPressure";
  const colorAt = (i) => {
    const palette = [
      "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
      "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
    ];
    return palette[i % palette.length];
  };
  const chartData = useMemo(() => {
    const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
    if (activeTab === TANK) {
      const propIdByName = Object.fromEntries((tankProperties || []).map(p => [p.name, p.id]));
      const convX = sysMap[propIdByName[xKey]];
      const convY = sysMap[propIdByName[yKey]];
      const apply = (v, c) => (c ? v * Number(c.scale_factor ?? 1) + Number(c.offset ?? 0) : v);
      const toNum = (v) => typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
      const points = rows
        .map((r) => {
          const xv = toNum(r?.[xKey]);
          const yv = toNum(r?.[yKey]);
          const x = apply(xv, convX);
          const y = apply(yv, convY);
          return isFinite(x) && isFinite(y) ? { x, y } : null;
        })
        .filter(Boolean);
      return {
        datasets: [
          {
            label: `${yKey} vs ${xKey}`,
            data: points,
            borderColor: colorAt(0),
            backgroundColor: colorAt(0) + "66",
            pointRadius: 3,
            showLine: true,
            tension: 0.25,
            fill: false,
            yAxisID: 'y',
          },
        ],
      };
    } else {
      // WELL: x = CumOilProd, y datasets = GOR and WCT
      const xk = 'CumOilProd';
      const y1 = 'GORProd';
      const y2 = 'WCTProd';
      const pid = Object.fromEntries((wellProperties || []).map(p => [p.name, p.id]));
      const convX = sysMap[pid[xk]];
      const convY1 = sysMap[pid[y1]];
      const convY2 = sysMap[pid[y2]];
      const apply = (v, c) => (c ? v * Number(c.scale_factor ?? 1) + Number(c.offset ?? 0) : v);
      const toNum = (v) => typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
      const pointsGOR = rowsWell
        .map((r) => {
          const xv = toNum(r?.[xk]);
          const yv = toNum(r?.[y1]);
          const x = apply(xv, convX);
          const y = apply(yv, convY1);
          return isFinite(x) && isFinite(y) ? { x, y } : null;
        })
        .filter(Boolean);
      const pointsWCT = rowsWell
        .map((r) => {
          const xv = toNum(r?.[xk]);
          const yv = toNum(r?.[y2]);
          const x = apply(xv, convX);
          const y = apply(yv, convY2);
          return isFinite(x) && isFinite(y) ? { x, y } : null;
        })
        .filter(Boolean);
      return {
        datasets: [
          {
            label: `${y1} vs ${xk}`,
            data: pointsGOR,
            borderColor: colorAt(0),
            backgroundColor: colorAt(0) + '66',
            pointRadius: 3,
            showLine: true,
            tension: 0.25,
            fill: false,
            yAxisID: 'y',
          },
          {
            label: `${y2} vs ${xk}`,
            data: pointsWCT,
            borderColor: colorAt(1),
            backgroundColor: colorAt(1) + '66',
            pointRadius: 3,
            showLine: true,
            tension: 0.25,
            fill: false,
            yAxisID: 'y1',
          },
        ],
      };
    }
  }, [activeTab, rows, rowsWell, selectedUnitSystemId, unitMapBySystem, tankProperties, wellProperties]);
  const chartOptions = useMemo(() => {
    const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
    if (activeTab === TANK) {
      const propIdByName = Object.fromEntries((tankProperties || []).map(p => [p.name, p.id]));
      const ux = sysMap[propIdByName[xKey]]?.unit;
      const uy = sysMap[propIdByName[yKey]]?.unit;
      const xTitle = ux ? `${xKey} (${ux})` : xKey;
      const yTitle = uy ? `${yKey} (${uy})` : yKey;
      return ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { position: "top" },
          title: { display: true, text: `${t("chart") || "Chart"}: ${yTitle} vs ${xTitle}` },
          tooltip: { callbacks: { label: (ctx) => `${yKey}: ${ctx.parsed.y}, ${xKey}: ${ctx.parsed.x}` } },
        },
        scales: {
          x: { type: "linear", title: { display: true, text: xTitle } },
          y: { type: "linear", title: { display: true, text: yTitle }, beginAtZero: false },
        },
      });
    } else {
      const pid = Object.fromEntries((wellProperties || []).map(p => [p.name, p.id]));
      const ux = sysMap[pid['CumOilProd']]?.unit;
      const uy0 = sysMap[pid['GOR']]?.unit || 'm³/m³';
      const uy1 = sysMap[pid['WCT']]?.unit || '%';
      const xTitle = ux ? `CumOilProd (${ux})` : 'CumOilProd';
      const y0Title = uy0 ? `GOR (${uy0})` : 'GOR';
      const y1Title = uy1 ? `WCT (${uy1})` : 'WCT';
      return ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { position: "top" },
          title: { display: true, text: `${t("chart") || "Chart"}: GOR & WCT vs ${xTitle}` },
        },
        scales: {
          x: { type: 'linear', title: { display: true, text: xTitle } },
          y: { type: 'linear', title: { display: true, text: y0Title }, beginAtZero: false },
          y1: { type: 'linear', title: { display: true, text: y1Title }, position: 'right', grid: { drawOnChartArea: false } },
        },
      });
    }
  }, [t, activeTab, selectedUnitSystemId, unitMapBySystem, tankProperties, wellProperties]);

  const buildRowsFromInstance = (instanceName, props) => {
    const seriesProps = props.filter((p) => !SINGLE_VALUE_PROPS.has(p));
    const mapForInstance = existingMap[instanceName] || {};
    const arrays = seriesProps.map((p) => toArray(mapForInstance[p]?.value || ""));
    const rowCount = Math.max(1, ...arrays.map((a) => a.length));
    const newRows = Array.from({ length: rowCount }, (_, i) => {
      const r = {};
      seriesProps.forEach((p, idx) => {
        r[p] = arrays[idx][i] ?? "";
      });
      return r;
    });
    setRows(newRows);

    const singles = {};
    props
      .filter((p) => SINGLE_VALUE_PROPS.has(p))
      .forEach((p) => {
        singles[p] = (mapForInstance[p]?.value ?? "").toString();
      });
    setSingleValues((prev) => ({ ...prev, ...singles }));
  };

  const rebuildFromSelections = () => {
    if (!selectedInstance) return;
    buildRowsFromInstance(selectedInstance, selectedProps);
  };

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const componentRes = await api.get(`/components/${id}/`);
        setComponentName(componentRes.data.name || "Component");

        const metaRes = await api.get("/object-metadata/");
        setTypeOptions(metaRes.data.types);
        setInstanceOptionsByType(metaRes.data.instances);
        setPropertyOptionsByType(metaRes.data.properties);

        const recRes = await api.get(`/components/decline-curves/${id}/`);
        const byInstance = {};
        for (const r of recRes.data) {
          const instName = r.object_instance; // backend returns names via serializer.to_internal? Event pages convert names; here it's ids; ensure names
          // Normalize: if got id, map to name using instances map
          let resolvedInstance = instName;
          if (typeof instName === "number") {
            const arr = Object.values(metaRes.data.instances).flat();
            resolvedInstance = arr.find((x) => x.id === instName)?.name || String(instName);
          }
          const propName = r.object_type_property;
          let resolvedProp = propName;
          if (typeof propName === "number") {
            const arr = Object.values(metaRes.data.properties).flat();
            resolvedProp = arr.find((x) => x.id === propName)?.name || String(propName);
          }
          if (!byInstance[resolvedInstance]) byInstance[resolvedInstance] = {};
          byInstance[resolvedInstance][resolvedProp] = {
            data_set_id: r.data_set_id,
            value: r.value || "",
          };
        }
        setExistingMap(byInstance);

        // Compute defaults directly from fresh metadata
        const tankInstFromRes = metaRes.data.instances[TANK] || [];
        const tankPropsFromRes = metaRes.data.properties[TANK] || [];
        const defaultInstance = tankInstFromRes[0]?.name || Object.keys(byInstance)[0] || "";
        setSelectedInstance(defaultInstance);
        const wellInstFromRes = metaRes.data.instances[WELL] || [];
        setSelectedWellInstance(wellInstFromRes[0]?.name || "");

        // Use all TANK properties initially (will auto-switch on tab)
        const availablePropNames = new Set(tankPropsFromRes.map((p) => p.name));
        setSelectedProps(Array.from(availablePropNames));

        // Load unit systems and mappings
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

        setLoading(false);
      } catch (e) {
        console.error(e);
        setError(t("loadError"));
        setLoading(false);
      }
    };
    fetchAll();
  }, [id]);

  useEffect(() => {
    if (!loading) rebuildFromSelections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstance, selectedProps, existingMap, loading]); // Properties are not selectable; we always show all TANK properties\n
  // Build WELL rows/single-values like TANK
  const buildWellRowsFromInstance = (instanceName, props) => {
    const seriesProps = props.filter((p) => !SINGLE_VALUE_PROPS.has(p));
    const mapForInstance = existingMap[instanceName] || {};
    const arrays = seriesProps.map((p) => toArray(mapForInstance[p]?.value || ""));
    const rowCount = Math.max(1, ...arrays.map((a) => a.length));
    const newRows = Array.from({ length: rowCount }, (_, i) => {
      const r = {};
      seriesProps.forEach((p, idx) => {
        r[p] = arrays[idx][i] ?? "";
      });
      return r;
    });
    setRowsWell(newRows);

    const singles = {};
    props
      .filter((p) => SINGLE_VALUE_PROPS.has(p))
      .forEach((p) => {
        singles[p] = (mapForInstance[p]?.value ?? "").toString();
      });
    setSingleValuesWell((prev) => ({ ...prev, ...singles }));
  };

  useEffect(() => {
    if (!loading && activeTab === WELL && selectedWellInstance) {
      buildWellRowsFromInstance(selectedWellInstance, selectedProps);
    }
  }, [activeTab, selectedWellInstance, selectedProps, existingMap, loading]);

  const handleWellCellChange = (rowIdx, prop, valueUi) => {
    const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
    const propId = (wellProperties || []).find(p => p.name === prop)?.id;
    const conv = propId ? sysMap[propId] : null;
    const toNum = (v) => parseFloat(String(v ?? "").replace(",", "."));
    const invert = (v, c) => (c ? (v - Number(c.offset ?? 0)) / Number(c.scale_factor ?? 1) : v);
    const uiNum = toNum(valueUi);
    const baseNum = invert(uiNum, conv);
    const baseStr = isFinite(baseNum) ? String(baseNum) : valueUi;
    const copy = [...rowsWell];
    copy[rowIdx] = { ...(copy[rowIdx] || {}), [prop]: baseStr };
    setRowsWell(copy);
  };

  const handleWellSingleChange = (prop, uiValue) => {
    const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
    const pid = (wellProperties || []).find(p => p.name === prop)?.id;
    const conv = pid ? sysMap[pid] : null;
    const toNum = (v) => parseFloat(String(v ?? "").replace(",", "."));
    const invert = (v, c) => (c ? (v - Number(c.offset ?? 0)) / Number(c.scale_factor ?? 1) : v);
    const uiNum = toNum(uiValue);
    const baseNum = invert(uiNum, conv);
    setSingleValuesWell((prev) => ({ ...prev, [prop]: isFinite(baseNum) ? String(baseNum) : uiValue }));
  };

  const handleWellExportCSV = () => {
    try {
      if (!selectedWellInstance) { alert(t("selectInstanceFirst") || "Please select an instance."); return; }
      const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
      const apply = (v, c) => (c ? v * Number(c.scale_factor ?? 1) + Number(c.offset ?? 0) : v);
      const toNum = (v) => typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
      const seriesProps = selectedProps.filter((p) => !SINGLE_VALUE_PROPS.has(p));
      const singleProps = selectedProps.filter((p) => SINGLE_VALUE_PROPS.has(p));
      // No Name column on export
      const header = [...seriesProps, ...singleProps];
      const lines = rowsWell.map((r, idx) => {
        const rowOut = {};
        seriesProps.forEach((p) => {
          const pid = wellPropIdByName[p];
          const conv = pid ? sysMap[pid] : null;
          const base = toNum(r?.[p] ?? "");
          rowOut[p] = isFinite(base) ? String(apply(base, conv)) : String(r?.[p] ?? "").trim();
        });
        if (idx === 0) {
          singleProps.forEach((p) => {
            const pid = wellPropIdByName[p];
            const conv = pid ? sysMap[pid] : null;
            const base = toNum(singleValuesWell[p] ?? "");
            rowOut[p] = isFinite(base) ? String(apply(base, conv)) : String(singleValuesWell[p] ?? "").trim();
          });
        } else {
          singleProps.forEach((p) => { rowOut[p] = ""; });
        }
        return header.map((k) => `"${String(rowOut[k] ?? "").replace(/"/g, '""')}"`).join(",");
      });
      const csv = [header.join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      saveAs(blob, `WellSummary_${selectedWellInstance}_${componentName || id}.csv`);
    } catch (err) {
      console.error("Export WELL error:", err);
      alert(t("saveError") || "Export error");
    }
  };

  const handleWellSave = async () => {
    try {
      if (!selectedWellInstance) { alert(t("selectInstanceFirst") || "Please select an instance."); return; }
      const typeId = typeOptions.find((t) => t.name === WELL)?.id;
      const instanceId = wellInstances.find((i) => i.name === selectedWellInstance)?.id;
      const pickOilfield = () => {
        const needle = ["oilfield", "oil field", "oil-field"];
        const found = (unitSystems || []).find(u => needle.some(n => String(u.name || "").toLowerCase().includes(n)));
        return found?.id ?? selectedUnitSystemId ?? null;
      };
      const oilId = pickOilfield();
      const oilMap = oilId ? (unitMapBySystem[oilId] || {}) : {};
      const toNum = (v) => typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
      const apply = (v, c) => (c ? v * Number(c.scale_factor ?? 1) + Number(c.offset ?? 0) : v);

      const seriesProps = selectedProps.filter((p) => !SINGLE_VALUE_PROPS.has(p));
      const singleProps = selectedProps.filter((p) => SINGLE_VALUE_PROPS.has(p));
      const seriesPayload = seriesProps.map((propName) => {
        const pid = wellPropIdByName[propName];
        const convOil = pid ? oilMap[pid] : null;
        const colVals = rowsWell.map((r) => {
          const baseRaw = (r?.[propName] ?? "").toString().trim();
          const n = toNum(baseRaw);
          if (!isFinite(n)) return baseRaw;
          const out = apply(n, convOil);
          return String(out);
        });
        const csv = colVals.join("|");
        const existing = existingMap[selectedWellInstance]?.[propName];
        const rec = {
          object_type: typeId || WELL,
          object_instance: instanceId || selectedWellInstance,
          object_type_property: pid || propName,
          value: csv,
        };
        if (existing?.data_set_id) rec.data_set_id = existing.data_set_id;
        return rec;
      });
      const singlePayload = singleProps.map((propName) => {
        const pid = wellPropIdByName[propName];
        const convOil = pid ? oilMap[pid] : null;
        const baseRaw = (singleValuesWell[propName] ?? "").toString().trim();
        const n = toNum(baseRaw);
        const val = isFinite(n) ? String(apply(n, convOil)) : baseRaw;
        const existing = existingMap[selectedWellInstance]?.[propName];
        const rec = {
          object_type: typeId || WELL,
          object_instance: instanceId || selectedWellInstance,
          object_type_property: pid || propName,
          value: val,
        };
        if (existing?.data_set_id) rec.data_set_id = existing.data_set_id;
        return rec;
      });

      const payload = [...seriesPayload, ...singlePayload];

      await api.post(`/components/decline-curves/${id}/`, payload);
      const recRes = await api.get(`/components/decline-curves/${id}/`);
      const newMap = {};
      for (const r of recRes.data) {
        let instName = r.object_instance;
        if (typeof instName === "number") {
          const arr = [...tankInstances, ...wellInstances];
          instName = arr.find((x) => x.id === instName)?.name || String(instName);
        }
        let propName = r.object_type_property;
        if (typeof propName === "number") {
          const arr = [...tankProperties, ...wellProperties];
          propName = arr.find((x) => x.id === propName)?.name || String(propName);
        }
        if (!newMap[instName]) newMap[instName] = {};
        newMap[instName][propName] = { data_set_id: r.data_set_id, value: r.value || "" };
      }
      setExistingMap(newMap);
      alert(t("savedSuccessfully") || "Saved");
    } catch (e) {
      console.error(e);
      alert(t("saveError") || "Save error");
    }
  };

  // Row add/remove controls removed per request

  const handleCellChange = (rowIdx, prop, valueUi) => {
    const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
    const propId = (tankProperties || []).find(p => p.name === prop)?.id;
    const conv = propId ? sysMap[propId] : null;
    const toNum = (v) => parseFloat(String(v ?? "").replace(",", "."));
    const invert = (v, c) => (c ? (v - Number(c.offset ?? 0)) / Number(c.scale_factor ?? 1) : v);
    const uiNum = toNum(valueUi);
    const baseNum = invert(uiNum, conv);
    const baseStr = isFinite(baseNum) ? String(baseNum) : valueUi;
    const copy = [...rows];
    copy[rowIdx] = { ...(copy[rowIdx] || {}), [prop]: baseStr };
    setRows(copy);
  };

  const fileInputRef = useRef(null);
  const fileInputWellRef = useRef(null);

  const handleImportCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rowsInFile = res.data || [];
        if (!rowsInFile.length) { if (fileInputRef.current) fileInputRef.current.value = ""; return; }
        // Map CSV columns to selected properties (case-insensitive)
        const norm = (s) => String(s || "").trim().toLowerCase();
        const seriesProps = selectedProps.filter((p) => !SINGLE_VALUE_PROPS.has(p));
        const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
        const propIdByName = Object.fromEntries((tankProperties || []).map(p => [p.name, p.id]));
        const toNum = (v) => parseFloat(String(v ?? "").replace(",", "."));
        const invert = (v, c) => (c ? (v - Number(c.offset ?? 0)) / Number(c.scale_factor ?? 1) : v);
        const remapped = rowsInFile.map((r) => {
          const out = {};
          for (const p of seriesProps) {
            const key = Object.keys(r).find((k) => norm(k) === norm(p));
            const uiRaw = key ? String(r[key] ?? "") : "";
            const pid = propIdByName[p];
            const conv = pid ? sysMap[pid] : null;
            const n = toNum(uiRaw);
            out[p] = isFinite(n) ? toRoundedString(invert(n, conv)) : uiRaw;
          }
          return out;
        });
        setRows(remapped);

        // Single-value properties are only taken from the first row (to match export)
        const singles = {};
        const firstRow = rowsInFile[0] || {};
        selectedProps
          .filter((p) => SINGLE_VALUE_PROPS.has(p))
          .forEach((p) => {
            const key = Object.keys(firstRow).find((k) => norm(k) === norm(p));
            const uiRaw = key ? String(firstRow[key] ?? "") : "";
            const pid = propIdByName[p];
            const conv = pid ? sysMap[pid] : null;
            const n = toNum(uiRaw);
            singles[p] = isFinite(n) ? toRoundedString(invert(n, conv)) : uiRaw;
          });
        setSingleValues((prev) => ({ ...prev, ...singles }));
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
      error: (err) => { alert(err.message); if (fileInputRef.current) fileInputRef.current.value = ""; },
    });
  };

  const handleImportCSVWell = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rowsInFile = res.data || [];
        if (!rowsInFile.length) { if (fileInputWellRef.current) fileInputWellRef.current.value = ""; return; }
        const norm = (s) => String(s || "").trim().toLowerCase();
        const seriesProps = selectedProps.filter((p) => !SINGLE_VALUE_PROPS.has(p));
        const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
        const toNum = (v) => parseFloat(String(v ?? "").replace(",", "."));
        const invert = (v, c) => (c ? (v - Number(c.offset ?? 0)) / Number(c.scale_factor ?? 1) : v);
        const remapped = rowsInFile.map((r) => {
          const out = {};
          for (const p of seriesProps) {
            const key = Object.keys(r).find((k) => norm(k) === norm(p));
            const uiRaw = key ? String(r[key] ?? "") : "";
            const pid = wellPropIdByName[p];
            const conv = pid ? sysMap[pid] : null;
            const n = toNum(uiRaw);
            out[p] = isFinite(n) ? toRoundedString(invert(n, conv)) : uiRaw;
          }
          return out;
        });
        setRowsWell(remapped);

        const singles = {};
        const firstRow = rowsInFile[0] || {};
        selectedProps
          .filter((p) => SINGLE_VALUE_PROPS.has(p))
          .forEach((p) => {
            const key = Object.keys(firstRow).find((k) => norm(k) === norm(p));
            const uiRaw = key ? String(firstRow[key] ?? "") : "";
            const pid = wellPropIdByName[p];
            const conv = pid ? sysMap[pid] : null;
            const n = toNum(uiRaw);
            singles[p] = isFinite(n) ? toRoundedString(invert(n, conv)) : uiRaw;
          });
        setSingleValuesWell((prev) => ({ ...prev, ...singles }));
        if (fileInputWellRef.current) fileInputWellRef.current.value = "";
      },
      error: (err) => { alert(err.message); if (fileInputWellRef.current) fileInputWellRef.current.value = ""; },
    });
  };

  // Paste modal support
  const handleExportCSV = () => {
    try {
      if (!selectedInstance) {
        alert(t("selectInstanceFirst") || "Please select an instance.");
        return;
      }
      const seriesProps = selectedProps.filter((p) => !SINGLE_VALUE_PROPS.has(p));
      const singleProps = selectedProps.filter((p) => SINGLE_VALUE_PROPS.has(p));

      // Convert to the currently selected unit system for export
      const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
      const propIdByName = Object.fromEntries((tankProperties || []).map(p => [p.name, p.id]));
      const apply = (v, c) => (c ? v * Number(c.scale_factor ?? 1) + Number(c.offset ?? 0) : v);
      const toNum = (v) => typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));

      // Build header: series columns (+ single columns at end). No Name column.
      const header = [...seriesProps, ...singleProps];

      // Build one CSV row per series row
      const lines = rows.map((r, idx) => {
        const rowOut = {};
        seriesProps.forEach((p) => {
          const pid = propIdByName[p];
          const conv = pid ? sysMap[pid] : null;
          const base = toNum(r?.[p] ?? "");
          rowOut[p] = isFinite(base) ? String(apply(base, conv)) : String(r?.[p] ?? "").trim();
        });
        if (idx === 0) {
          // Fill single-value properties only on the first row
          singleProps.forEach((p) => {
            const pid = propIdByName[p];
            const conv = pid ? sysMap[pid] : null;
            const base = toNum(singleValues[p] ?? "");
            rowOut[p] = isFinite(base) ? String(apply(base, conv)) : String(singleValues[p] ?? "").trim();
          });
        } else {
          // Leave single-value properties empty on subsequent rows
          singleProps.forEach((p) => { rowOut[p] = ""; });
        }
        return header
          .map((k) => `"${String(rowOut[k] ?? "").replace(/"/g, '""')}"`)
          .join(",");
      });

      const csv = [header.join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      saveAs(blob, `DeclineCurves_${selectedInstance}_${componentName || id}.csv`);
    } catch (err) {
      console.error("Export error:", err);
      alert(t("saveError") || "Export error");
    }
  };
  // Paste import removed per request

  const handleSave = async () => {
    try {
      // Guardrails
      if (!selectedInstance) {
        alert(t("selectInstanceFirst") || "Please select an instance.");
        return;
      }
      if (!selectedProps.length) {
        alert(t("selectAtLeastOneProperty") || "Select at least one property.");
        return;
      }
      // Build payload per selected instance
      const typeId = typeOptions.find((t) => t.name === TANK)?.id;
      const instanceId = tankInstances.find((i) => i.name === selectedInstance)?.id;

      const seriesProps = selectedProps.filter((p) => !SINGLE_VALUE_PROPS.has(p));
      const singleProps = selectedProps.filter((p) => SINGLE_VALUE_PROPS.has(p));

      // Determine Oilfield unit system id (fallback to currently selected if not found)
      const pickOilfield = () => {
        const needle = ["oilfield", "oil field", "oil-field"];
        const found = (unitSystems || []).find(u => needle.some(n => String(u.name || "").toLowerCase().includes(n)));
        return found?.id ?? selectedUnitSystemId ?? null;
      };
      const oilfieldSystemId = pickOilfield();
      const oilMap = oilfieldSystemId ? (unitMapBySystem[oilfieldSystemId] || {}) : {};
      const propIdByName = Object.fromEntries((tankProperties || []).map(p => [p.name, p.id]));
      const apply = (v, c) => (c ? v * Number(c.scale_factor ?? 1) + Number(c.offset ?? 0) : v);
      const toNum = (v) => typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));

      const seriesPayload = seriesProps.map((propName) => {
        const pid = propIdByName[propName];
        const convOil = pid ? oilMap[pid] : null;
        const colVals = rows.map((r) => {
          const baseRaw = (r?.[propName] ?? "").toString().trim();
          const n = toNum(baseRaw);
          if (!isFinite(n)) return baseRaw; // keep as-is if not numeric
          const out = apply(n, convOil);
          return String(out);
        });
        const csv = colVals.join("|");
        const existing = existingMap[selectedInstance]?.[propName];
        const propId = tankProperties.find((p) => p.name === propName)?.id;
        const rec = {
          object_type: typeId || TANK,
          object_instance: instanceId || selectedInstance,
          object_type_property: propId || propName,
          value: csv,
        };
        if (existing?.data_set_id) rec.data_set_id = existing.data_set_id;
        return rec;
      });

      const singlePayload = singleProps.map((propName) => {
        const pid = propIdByName[propName];
        const convOil = pid ? oilMap[pid] : null;
        const baseRaw = (singleValues[propName] ?? "").toString().trim();
        const n = toNum(baseRaw);
        const val = isFinite(n) ? String(apply(n, convOil)) : baseRaw;
        const existing = existingMap[selectedInstance]?.[propName];
        const propId = tankProperties.find((p) => p.name === propName)?.id;
        const rec = {
          object_type: typeId || TANK,
          object_instance: instanceId || selectedInstance,
          object_type_property: propId || propName,
          value: val,
        };
        if (existing?.data_set_id) rec.data_set_id = existing.data_set_id;
        return rec;
      });

      const payload = [...seriesPayload, ...singlePayload];

      const res = await api.post(`/components/decline-curves/${id}/`, payload);

      // Re-fetch to sync state
      const recRes = await api.get(`/components/decline-curves/${id}/`);
      const newMap = {};
      for (const r of recRes.data) {
        let instName = r.object_instance;
        if (typeof instName === "number") {
          const arr = tankInstances;
          instName = arr.find((x) => x.id === instName)?.name || String(instName);
        }
        let propName = r.object_type_property;
        if (typeof propName === "number") {
          const arr = tankProperties;
          propName = arr.find((x) => x.id === propName)?.name || String(propName);
        }
        if (!newMap[instName]) newMap[instName] = {};
        newMap[instName][propName] = { data_set_id: r.data_set_id, value: r.value || "" };
      }
      setExistingMap(newMap);
      alert(t("savedSuccessfully") || "Saved");
    } catch (e) {
      console.error(e);
      alert(t("saveError") || "Save error");
    }
  };

  if (loading) return <Spinner animation="border" />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
  <Card className="ds-card p-3 decline-page">
    <div className="decline-split">
      {/* Left pane (compact 25%) */}
      <div className="left-pane compact">
        {/* Tabs */}
        <div className="d-flex mb-3" style={{ gap: "8px" }}>
          <Button
            size="sm"
            variant={activeTab === TANK ? "primary" : "light"}
            onClick={() => setActiveTab(TANK)}
          >
            {TANK}
          </Button>
          <Button
            size="sm"
            variant={activeTab === WELL ? "primary" : "light"}
            onClick={() => setActiveTab(WELL)}
          >
            {WELL}
          </Button>
        </div>
        {/* Toolbar */}
        <div className="toolbar-top">
          <h5 className="ds-heading mb-2">
            {t("Decline Curves") || "Decline Curves"} · {componentName}
          </h5>

          {/* Action buttons */}
          <div className="d-flex flex-wrap gap-2 mb-3">
            {activeTab === TANK && (
              <Button size="sm" variant="None" className="btn-brand" onClick={handleSave}>
                {t("save") || "Save"}
              </Button>
            )}
            {activeTab === TANK && (
              <Button size="sm" variant="None" className="btn-brand" onClick={handleExportCSV}>
                {t("exportCSV") || "Export"}
              </Button>
            )}
            {activeTab === WELL && (
              <Button size="sm" variant="None" className="btn-brand" onClick={handleWellSave}>
                {t("save") || "Save"}
              </Button>
            )}
            {activeTab === WELL && (
              <Button size="sm" variant="None" className="btn-brand" onClick={handleWellExportCSV}>
                {t("exportCSV") || "Export"}
              </Button>
            )}
            <Button size="sm" variant="None" className="btn-brand" onClick={() => navigate(-1)}>
              {t("back") || "Back"}
            </Button>
          </div>

          {/* Instance selector + Import CSV on same row */}
          {activeTab === TANK && (
            <div className="d-flex justify-content-between align-items-end mb-3">
              <Form.Group style={{ flexGrow: 1, marginRight: "0.5rem" }}>
                <Form.Label>{t("instance") || "Instance"}</Form.Label>
                <Form.Select
                  size="sm"
                  className="ds-input"
                  value={selectedInstance}
                  onChange={(e) => setSelectedInstance(e.target.value)}
                >
                  {tankInstances.map((i) => (
                    <option key={i.id} value={i.name}>
                      {i.name}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>

              {/* CSV upload on the right */}
              <Form.Group style={{ minWidth: 120 }}>
                <Form.Label>{t("importCSV") || "Import CSV"}</Form.Label>
                <Form.Control
                  ref={fileInputRef}
                  size="sm"
                  className="ds-input"
                  type="file"
                  accept=".csv"
                  onChange={handleImportCSV}
                />
              </Form.Group>
            </div>
          )}
          {activeTab === WELL && (
            <div className="d-flex justify-content-between align-items-end mb-3">
              <Form.Group style={{ flexGrow: 1, marginRight: "0.5rem" }}>
                <Form.Label>{t("instance") || "Instance"}</Form.Label>
                <Form.Select
                  size="sm"
                  className="ds-input"
                  value={selectedWellInstance}
                  onChange={(e) => setSelectedWellInstance(e.target.value)}
                >
                  {wellInstances.map((i) => (
                    <option key={i.id} value={i.name}>{i.name}</option>
                  ))}
                </Form.Select>
              </Form.Group>

              {/* CSV upload for WELL */}
              <Form.Group style={{ minWidth: 120 }}>
                <Form.Label>{t("importCSV") || "Import CSV"}</Form.Label>
                <Form.Control
                  ref={fileInputWellRef}
                  size="sm"
                  className="ds-input"
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleImportCSVWell(e)}
                />
              </Form.Group>
            </div>
          )}

          {/* Unit system */}
          <div className="d-flex align-items-end mb-3" style={{ gap: "8px" }}>
            <Form.Group style={{ minWidth: 200 }}>
              <Form.Label>{t("unitSystem") || "Unit System"}</Form.Label>
              <Form.Select
                size="sm"
                className="ds-input"
                value={selectedUnitSystemId || ""}
                onChange={(e) => setSelectedUnitSystemId(e.target.value ? Number(e.target.value) : null)}
              >
                {unitSystems.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Form.Select>
            </Form.Group>
          </div>

          {/* Single-value properties just below */}
          {activeTab === TANK && selectedProps.some((p) => SINGLE_VALUE_PROPS.has(p)) && (
            <div className="single-values mb-3">
              <div className="d-flex flex-wrap gap-2">
                {selectedProps
                  .filter((p) => SINGLE_VALUE_PROPS.has(p))
                  .map((p) => (
                    <Form.Group key={p} style={{ minWidth: 140 }}>
                      <Form.Label className="small">
                        {(() => {
                          const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
                          const pid = (tankProperties || []).find(tp => tp.name === p)?.id;
                          const unit = pid ? sysMap[pid]?.unit : null;
                          return unit ? `${p} (${unit})` : p;
                        })()}
                      </Form.Label>
                      <Form.Control
                        size="sm"
                        className="ds-input"
                        value={(function(){
                          const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
                          const pid = (tankProperties || []).find(tp => tp.name === p)?.id;
                          const conv = pid ? sysMap[pid] : null;
                          const apply = (v, c) => (c ? v * Number(c.scale_factor ?? 1) + Number(c.offset ?? 0) : v);
                          const n = parseFloat(String((singleValues[p] ?? "")).replace(",","."));
                          return isFinite(n) ? toRoundedString(apply(n, conv), 6) : (singleValues[p] ?? "");
                        })()}
                        onChange={(e) => {
                          const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
                          const pid = (tankProperties || []).find(tp => tp.name === p)?.id;
                          const conv = pid ? sysMap[pid] : null;
                          const toNum = (v) => parseFloat(String(v ?? "").replace(",", "."));
                          const invert = (v, c) => (c ? (v - Number(c.offset ?? 0)) / Number(c.scale_factor ?? 1) : v);
                          const uiNum = toNum(e.target.value);
                          const baseNum = invert(uiNum, conv);
                          setSingleValues((prev) => ({ ...prev, [p]: isFinite(baseNum) ? String(baseNum) : e.target.value }));
                        }}
                      />
                    </Form.Group>
                  ))}
              </div>
            </div>
          )}
          {activeTab === WELL && selectedProps.some((p) => SINGLE_VALUE_PROPS.has(p)) && (
            <div className="single-values mb-3">
              <div className="d-flex flex-wrap gap-2">
                {selectedProps
                  .filter((p) => SINGLE_VALUE_PROPS.has(p))
                  .map((p) => (
                    <Form.Group key={p} style={{ minWidth: 140 }}>
                      <Form.Label className="small">
                        {(() => {
                          const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
                          const pid = (wellProperties || []).find(tp => tp.name === p)?.id;
                          const unit = pid ? sysMap[pid]?.unit : null;
                          return unit ? `${p} (${unit})` : p;
                        })()}
                      </Form.Label>
                      <Form.Control
                        size="sm"
                        className="ds-input"
                        value={(function(){
                          const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
                          const pid = (wellProperties || []).find(tp => tp.name === p)?.id;
                          const conv = pid ? sysMap[pid] : null;
                          const apply = (v, c) => (c ? v * Number(c.scale_factor ?? 1) + Number(c.offset ?? 0) : v);
                          const n = parseFloat(String((singleValuesWell[p] ?? "")).replace(",","."));
                          return isFinite(n) ? toRoundedString(apply(n, conv), 6) : (singleValuesWell[p] ?? "");
                        })()}
                        onChange={(e) => handleWellSingleChange(p, e.target.value)}
                      />
                    </Form.Group>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Tables */}
        {activeTab === TANK && (
          <div className="brand-scroll" style={{ maxHeight: "calc(100vh - 300px)", overflowY: "auto" }}>
            <Table bordered size="sm" className="rounded ds-table">
              <thead className="ds-thead sticky-top">
                <tr>
                  <th style={{ width: "40px" }}>#</th>
                  {selectedProps
                    .filter((p) => !SINGLE_VALUE_PROPS.has(p))
                    .map((p) => {
                      const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
                      const pid = (tankProperties || []).find(tp => tp.name === p)?.id;
                      const conv = pid ? sysMap[pid] : null;
                      const unit = conv?.unit ? ` (${conv.unit})` : "";
                      return <th key={p}>{p}{unit}</th>;
                    })}
              </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    {selectedProps
                      .filter((p) => !SINGLE_VALUE_PROPS.has(p))
                      .map((p) => {
                        const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
                        const pid = (tankProperties || []).find(tp => tp.name === p)?.id;
                        const conv = pid ? sysMap[pid] : null;
                        const toNum = (v) => typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
                        const apply = (v, c) => (c ? v * Number(c.scale_factor ?? 1) + Number(c.offset ?? 0) : v);
                        const base = toNum(r?.[p] ?? "");
                        const uiVal = isFinite(base) ? toRoundedString(apply(base, conv), 6) : (r?.[p] ?? "");
                        return (
                          <td key={p}>
                            <Form.Control
                              size="sm"
                              className="ds-input"
                              value={uiVal}
                              onChange={(e) => handleCellChange(idx, p, e.target.value)}
                            />
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}

        {activeTab === WELL && (
          <div className="brand-scroll" style={{ maxHeight: "calc(100vh - 300px)", overflowY: "auto" }}>
            <Table bordered size="sm" className="rounded ds-table">
              <thead className="ds-thead sticky-top">
                <tr>
                  <th style={{ width: "40px" }}>#</th>
                  {selectedProps
                    .filter((p) => !SINGLE_VALUE_PROPS.has(p))
                    .map((p) => {
                      const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
                      const pid = (wellProperties || []).find(tp => tp.name === p)?.id;
                      const conv = pid ? sysMap[pid] : null;
                      const unit = conv?.unit ? ` (${conv.unit})` : "";
                      const label = p === "GOR" ? `GOR (m³/m³)` : p === "WCT" ? `WCT (%)` : `${p}${unit}`;
                      return <th key={p}>{label}</th>;
                    })}
                </tr>
              </thead>
              <tbody>
                {rowsWell.map((r, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    {selectedProps
                      .filter((p) => !SINGLE_VALUE_PROPS.has(p))
                      .map((p) => {
                        const sysMap = selectedUnitSystemId ? (unitMapBySystem[selectedUnitSystemId] || {}) : {};
                        const pid = (wellProperties || []).find(tp => tp.name === p)?.id;
                        const conv = pid ? sysMap[pid] : null;
                        const toNum = (v) => typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
                        const apply = (v, c) => (c ? v * Number(c.scale_factor ?? 1) + Number(c.offset ?? 0) : v);
                        const base = toNum(r?.[p] ?? "");
                        const uiVal = isFinite(base) ? toRoundedString(apply(base, conv), 6) : (r?.[p] ?? "");
                        return (
                          <td key={p}>
                            <Form.Control
                              size="sm"
                              className="ds-input"
                              value={uiVal}
                              onChange={(e) => handleWellCellChange(idx, p, e.target.value)}
                            />
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </div>

      {/* Right pane (chart for both TANK and WELL) */}
      <div className="right-pane">
        <Card className="p-3 w-100 h-100">
          <div className="chart-inner full" style={{ height: "100%" }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        </Card>
      </div>
    </div>
  </Card>
);
}
