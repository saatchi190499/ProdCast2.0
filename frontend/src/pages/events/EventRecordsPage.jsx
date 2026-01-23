import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../utils/axiosInstance";
import { Card, Table, Button, Form, Spinner, Alert, Modal } from "react-bootstrap";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  TimeScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import "chartjs-adapter-date-fns";
import { saveAs } from "file-saver";
import Papa from "papaparse";
import { useTranslation } from "react-i18next";
import useWellBranches from "./useWellBranches";
import "../DataSourcePage.css";

const HistoryDataCursorPlugin = {
  id: "historyDataCursor",
  afterEvent(chart, args) {
    const { event } = args;
    if (!event) return;
    if (event.type === "mouseout") {
      chart._historyCursor = null;
      chart.draw();
      return;
    }
    if (event.type !== "mousemove") return;
    const points = chart.getElementsAtEventForMode(
      event,
      "nearest",
      { intersect: false },
      true
    );
    if (!points.length) {
      chart._historyCursor = null;
      chart.draw();
      return;
    }
    const first = points[0];
    const parsed = first.element?.$context?.parsed || {};
    chart._historyCursor = {
      x: first.element.x,
      y: first.element.y,
      xValue: parsed.x,
      yValue: parsed.y,
    };
    chart.draw();
  },
  afterDatasetsDraw(chart) {
    const cursor = chart._historyCursor;
    const { ctx, chartArea } = chart;
    if (!cursor || !chartArea) return;
    const { x } = cursor;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(29, 172, 190, 0.7)";
    ctx.stroke();

    const pluginOpts = chart.options?.plugins?.historyDataCursor || {};
    const unit = pluginOpts.unit || "";
    const decimals = Number.isFinite(pluginOpts.decimals) ? pluginOpts.decimals : null;

    const formatX = (() => {
      if (!cursor.xValue) return "";
      const dt = new Date(cursor.xValue);
      if (isNaN(dt.getTime())) return String(cursor.xValue);
      return dt.toLocaleString();
    })();

    let yLabel = "";
    if (cursor.yValue !== undefined && cursor.yValue !== null) {
      const yNum = Number(cursor.yValue);
      if (!isNaN(yNum)) {
        yLabel = decimals === null ? String(yNum) : yNum.toFixed(decimals);
      } else {
        yLabel = String(cursor.yValue);
      }
    }
    if (unit && yLabel) yLabel = `${yLabel} ${unit}`;

    const label = formatX && yLabel ? `${formatX} | ${yLabel}` : (formatX || yLabel);

    if (label) {
      ctx.font = "12px sans-serif";
      const padding = 6;
      const metrics = ctx.measureText(label);
      const boxW = metrics.width + padding * 2;
      const boxH = 20;
      let boxX = x + 8;
      const boxY = chartArea.top + 6;
      if (boxX + boxW > chartArea.right) {
        boxX = x - 8 - boxW;
      }
      ctx.fillStyle = "rgba(29, 172, 190, 0.12)";
      ctx.strokeStyle = "rgba(29, 172, 190, 0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(boxX, boxY, boxW, boxH);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#137f8f";
      ctx.fillText(label, boxX + padding, boxY + 14);
    }
    ctx.restore();
  },
};

ChartJS.register(TimeScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, HistoryDataCursorPlugin);

export default function EventRecordsPage({ apiPathPrefix = "events", headingLabel, readOnly = false, showTag = false, showTime = false } = {}) {
  const { wellBranches, loadingBranches } = useWellBranches();
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [filteredRecords, setFilteredRecords] = useState([]);
  const [errorsMap, setErrorsMap] = useState({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [componentName, setComponentName] = useState("");
  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [bulkEdit, setBulkEdit] = useState({ field: "", value: "" });

  const recordsBodyRef = useRef(null);
  const [recordsScrollPad, setRecordsScrollPad] = useState(0);

  const historyBodyRef = useRef(null);
  const [historyScrollPad, setHistoryScrollPad] = useState(0);

  const [typeOptions, setTypeOptions] = useState([]);
  const [instanceOptions, setInstanceOptions] = useState({});
  const [propertyOptions, setPropertyOptions] = useState({});

  const [selectedUnitSystemId, setSelectedUnitSystemId] = useState(null);
  const [unitSystemMappings, setUnitSystemMappings] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [historyRow, setHistoryRow] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyRangePreset, setHistoryRangePreset] = useState("30d");
  const [historyStart, setHistoryStart] = useState("");
  const [historyEnd, setHistoryEnd] = useState("");

  const formatDateTimeLocal = (value) => {
    if (!value) return "";
    if (typeof value === "string" && value.includes("T") && value.length >= 16) {
      return value.slice(0, 16);
    }
    const dt = new Date(value);
    if (isNaN(dt.getTime())) return String(value || "");
    const yyyy = String(dt.getFullYear());
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    const hh = String(dt.getHours()).padStart(2, "0");
    const min = String(dt.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  };

  const emptyRow = {
    date_time: "", object_type: "", object_instance: "", object_type_property: "",
    value: "", tag: "", sub_data_source: "", description: ""
  };

  const getCategoryForProperty = (objectTypeName, propertyName) => {
    const prop = propertyOptions[objectTypeName]?.find(p => p.name === propertyName);
    return prop?.category || "";
  };

  const getConversionForProperty = (propertyName) => {
    if (!selectedUnitSystemId) return { scale: 1, offset: 0 };
    const system = unitSystemMappings.find(s => s.unit_system_id === selectedUnitSystemId);
    if (!system) return { scale: 1, offset: 0 };
    const prop = system.properties.find(p => p.property_name === propertyName);
    return {
      scale: prop?.scale_factor ?? 1,
      offset: prop?.offset ?? 0
    };
  };

  const getUnitForProperty = (propertyName) => {
    if (!selectedUnitSystemId) return "";
    const system = unitSystemMappings.find(s => s.unit_system_id === selectedUnitSystemId);
    if (!system) return "";
    const prop = system.properties.find(p => p.property_name === propertyName);
    return prop?.unit || "";
  };

  const convertIdsToNames = (data, typeList, instanceMap, propertyMap) => {
    return data.map((r) => {
      const typeName = typeList.find((t) => t.id === r.object_type)?.name || "";
      const instanceName = Object.values(instanceMap).flat().find((x) => x.id === r.object_instance)?.name || "";
      const propObj = Object.values(propertyMap).flat().find((x) => x.id === r.object_type_property);

      return {
        ...r,
        object_type: typeName,
        object_instance: instanceName,
        object_type_property: propObj?.name || "",
        unit: propObj?.unit || "",
        sub_data_source: propObj?.category || "",   // <-- auto-filled here
      };
    });
  };

  const validateRow = (r) => {
    const validInstances = instanceOptions[r.object_type] || [];
    const validProps = propertyOptions[r.object_type] || [];

    return {
      date_time: !r.date_time?.trim?.(),
      object_type: !r.object_type?.trim?.(),
      object_instance: !r.object_instance?.trim?.() ||
        (validInstances.length > 0 && !validInstances.find(x => x.name === r.object_instance)),
      object_type_property: !r.object_type_property?.trim?.() ||
        (validProps.length > 0 && !validProps.find(x => x.name === r.object_type_property)),
      value: r.value === "" || r.value === null || Number(r.value) < 0,
    };
  };

  const applyFiltersAndSorting = (data) => {
    let filtered = data.filter((r) =>
      Object.values(r).some((v) => String(v).toLowerCase().includes(searchText.toLowerCase()))
    );
    if (sortKey) {
      filtered.sort((a, b) => {
        const aVal = a[sortKey] ?? "", bVal = b[sortKey] ?? "";
        return sortAsc
          ? String(aVal).localeCompare(bVal, undefined, { numeric: true })
          : String(bVal).localeCompare(aVal, undefined, { numeric: true });
      });
    }
    setFilteredRecords(filtered);
  };


  useEffect(() => {
    const el = recordsBodyRef.current;
    if (!el) return;
    const update = () => {
      const pad = el.offsetWidth - el.clientWidth;
      setRecordsScrollPad(pad > 0 ? pad : 0);
    };
    update();
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      if (ro) ro.disconnect();
    };
  }, [filteredRecords.length]);

  useEffect(() => {
    const el = historyBodyRef.current;
    if (!el) return;
    const update = () => {
      const pad = el.offsetWidth - el.clientWidth;
      setHistoryScrollPad(pad > 0 ? pad : 0);
    };
    update();
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      if (ro) ro.disconnect();
    };
  }, [historyData.length, showHistory]);

  useEffect(() => {
    api.get("/unit-system-property-mapping/").then(res => {
      setUnitSystemMappings(res.data);
      // Set default unit system to "Oil Field" if available
      const oilField = res.data.find(s => s.unit_system_name === "Oil Field");
      if (oilField) setSelectedUnitSystemId(oilField.unit_system_id);
      else if (res.data.length > 0) setSelectedUnitSystemId(res.data[0].unit_system_id);
    });
  }, []);


  useEffect(() => {
    const fetchAll = async () => {
      try {
        const componentRes = await api.get(`/components/${id}/`);
        setComponentName(componentRes.data.name || "Component");

        const metaRes = await api.get("/object-metadata/");
        const types = metaRes.data.types;
        const instances = metaRes.data.instances;
        const properties = metaRes.data.properties;
        setTypeOptions(types);
        setInstanceOptions(instances);
        setPropertyOptions(properties);

        const recordsRes = await api.get(`/components/${apiPathPrefix}/${id}`);

        const converted = convertIdsToNames(recordsRes.data, types, instances, properties);
        setRecords(converted);

        const initialErrors = {};
        converted.forEach((r, i) => {
          initialErrors[i] = validateRow(r);
        });
        setErrorsMap(initialErrors);

        setLoading(false);
      } catch (err) {
        setError(t("loadError"));
        setRecords([emptyRow]);
        setErrorsMap({ 0: validateRow(emptyRow) });
        setLoading(false);
      }
    };
    fetchAll();
  }, [id]);

  useEffect(() => {
    const updated = records.map((r) => {
      const validInstances = instanceOptions[r.object_type] || [];
      const validProps = propertyOptions[r.object_type] || [];

      let object_instance = r.object_instance;
      let object_type_property = r.object_type_property;

      if (!validInstances.find(x => x.name === object_instance)) object_instance = "";
      if (!validProps.find(x => x.name === object_type_property)) {
        object_type_property = "";
      }

      const unit = object_type_property
        ? (validProps.find(p => p.name === object_type_property)?.unit || "")
        : "";

      const sub_data_source = object_type_property
        ? (validProps.find(p => p.name === object_type_property)?.category || "")
        : "";

      return { ...r, object_instance, object_type_property, unit, sub_data_source };
    });

    setRecords(updated);
  }, [instanceOptions, propertyOptions]);

  useEffect(() => { applyFiltersAndSorting(records); }, [records, searchText, sortKey, sortAsc]);

  const validateRecords = () => {
    const newErrorsMap = {};
    records.forEach((r, idx) => {
      newErrorsMap[idx] = validateRow(r);
    });
    setErrorsMap(newErrorsMap);
    return !Object.values(newErrorsMap).some(err => Object.values(err).includes(true));
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data.map(row => {
          const cleanRow = { ...emptyRow, ...row };

          if (cleanRow.date_time && cleanRow.date_time.includes("/")) {
            const [d, m, y] = cleanRow.date_time.split("/");
            cleanRow.date_time = (d && m && y)
              ? `${y.padStart(4, "20")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
              : "";
          }

          // Recompute unit & category from the selected property
          const unit = getUnitForProperty(cleanRow.object_type_property);
          const category = getCategoryForProperty(cleanRow.object_type, cleanRow.object_type_property);

          // Convert numeric CSV value from selected-unit display to base units for storage
          let value = cleanRow.value;
          const numericCandidate = typeof value === 'string' ? value.replace(",", ".") : value;
          if (
            cleanRow.object_type_property !== "Route" &&
            numericCandidate !== "" &&
            numericCandidate !== null &&
            !isNaN(Number(numericCandidate))
          ) {
            const { scale, offset } = getConversionForProperty(cleanRow.object_type_property);
            const displayValue = Number(numericCandidate);
            const baseValue = scale !== 0 ? ((displayValue - offset) / scale) : displayValue;
            value = baseValue;
          }

          return {
            ...cleanRow,
            value,
            unit,
            sub_data_source: category, // <-- override whatever came from CSV
          };
        });
        // Replace table data instead of appending
        setRecords(parsed);

        const updatedErrorsMap = {};
        parsed.forEach((r, idx) => {
          updatedErrorsMap[idx] = validateRow(r);
        });
        setErrorsMap(updatedErrorsMap);
        applyFiltersAndSorting(parsed);
      },
      error: (err) => alert(t("parseError") + ": " + err.message)
    });
  };

  const handleExportCSV = () => {
    // Export values in the currently selected unit system and include unit column
    const formatDateDDMMYYYY = (input) => {
      if (!input) return "";
      const s = String(input);
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s; // already formatted
      const datePart = s.includes('T') ? s.split('T')[0] : s;
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        const [y, m, d] = datePart.split('-');
        return `${d}/${m}/${y}`;
      }
      const dt = new Date(s);
      if (!isNaN(dt.getTime())) {
        const d = String(dt.getDate()).padStart(2, '0');
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const y = String(dt.getFullYear());
        return `${d}/${m}/${y}`;
      }
      return s;
    };
    const exportKeys = [
      "date_time",
      "object_type",
      "object_instance",
      "object_type_property",
      "value",
      "unit",
      "sub_data_source",
      "description"
    ];
    const header = exportKeys.join(",");
    const rows = records.map((r) => {
      let displayValue = r.value;
      if (
        r.object_type_property !== "Route" &&
        displayValue !== "" &&
        displayValue !== null &&
        !isNaN(Number(displayValue))
      ) {
        const { scale, offset } = getConversionForProperty(r.object_type_property);
        displayValue = Number(displayValue) * scale + offset;
      }
      const unit = getUnitForProperty(r.object_type_property);
      const rowObj = { ...r, date_time: formatDateDDMMYYYY(r.date_time), value: displayValue, unit };
      return exportKeys
        .map((k) => `"${String(rowObj[k] ?? "").replace(/"/g, '""')}"`)
        .join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `Event_${componentName}_${id}.csv`);
  };


  const handleSort = (key) => {
    setSortKey(prev => (prev === key ? key : key));
    setSortAsc(prev => (sortKey === key ? !prev : true));
  };

  const handleChange = (filteredIndex, field, value) => {
    const realIndex = records.findIndex((r) => r === filteredRecords[filteredIndex]);
    if (realIndex === -1) return;
    const updated = [...records];

    updated[realIndex][field] = value;

    if (field === "object_type") {
      updated[realIndex]["object_instance"] = "";
      updated[realIndex]["object_type_property"] = "";
      updated[realIndex]["unit"] = "";
      updated[realIndex]["sub_data_source"] = ""; // <-- clear
    } else if (field === "object_type_property") {
      const otName = updated[realIndex].object_type;
      const selectedProp = propertyOptions[otName]?.find((p) => p.name === value);

      updated[realIndex]["unit"] = selectedProp?.unit || "";
      updated[realIndex]["sub_data_source"] = selectedProp?.category || ""; // <-- auto category
    }

    setRecords(updated);
    const updatedErrorsMap = { ...errorsMap };
    updatedErrorsMap[realIndex] = validateRow(updated[realIndex]);
    setErrorsMap(updatedErrorsMap);
  };

  const addEmptyRow = () => {
    const updated = [...records, { ...emptyRow }];
    setRecords(updated);
    const updatedErrorsMap = { ...errorsMap, [updated.length - 1]: validateRow(emptyRow) };
    setErrorsMap(updatedErrorsMap);
    applyFiltersAndSorting(updated);
  };

  const removeEmptyRows = () => {
    const filtered = records.filter((r) =>
      Object.values(r).some((v) => String(v).trim() !== "")
    );
    const updatedErrorsMap = {};
    filtered.forEach((r, i) => {
      updatedErrorsMap[i] = validateRow(r);
    });
    setRecords(filtered);
    setErrorsMap(updatedErrorsMap);
    applyFiltersAndSorting(filtered);
  };

  const handleDeleteRow = (filteredIndex) => {
    const realIndex = records.findIndex((r) => r === filteredRecords[filteredIndex]);
    if (realIndex === -1) return;
    const updated = [...records];
    updated.splice(realIndex, 1);
    const updatedErrorsMap = {};
    updated.forEach((r, i) => {
      updatedErrorsMap[i] = validateRow(r);
    });
    setRecords(updated);
    setErrorsMap(updatedErrorsMap);
    applyFiltersAndSorting(updated);
  };

  const handleBulkEdit = () => {
    if (!bulkEdit.field || bulkEdit.value === "") return;
    const updated = records.map((row) =>
      filteredRecords.includes(row) ? { ...row, [bulkEdit.field]: bulkEdit.value } : row
    );
    setRecords(updated);
    applyFiltersAndSorting(updated);
  };

  const convertNamesToIds = (data) => {
    return data.map((r) => {
      const typeId = typeOptions.find(t => t.name === r.object_type)?.id;
      const instanceId = (instanceOptions[r.object_type] || []).find(i => i.name === r.object_instance)?.id;
      const propId = (propertyOptions[r.object_type] || []).find(p => p.name === r.object_type_property)?.id;

      // Normalize date_time to ISO8601 with timezone (UTC)
      let dtOut = r.date_time;
      try {
        if (dtOut) {
          const hasTime = String(dtOut).includes('T');
          const d = new Date(hasTime ? dtOut : `${dtOut}T00:00:00`);
          if (!isNaN(d.getTime())) dtOut = d.toISOString();
        }
      } catch (e) {
        dtOut = r.date_time;
      }

      return {
        ...r,
        date_time: dtOut,
        object_type: typeId,
        object_instance: instanceId,
        object_type_property: propId,
        // sub_data_source: r.sub_data_source?.trim() === "" ? null : r.sub_data_source,
        description: r.description?.trim() === "" ? null : r.description,
      };
    });
  };

  const handleSave = async () => {
    if (readOnly) return;
    if (!validateRecords()) {
      alert(t("fillRequired")); // или замените на тост
      return;
    }

    try {
      const dataToSave = convertNamesToIds(records);
      await api.post(`/components/${apiPathPrefix}/${id}`, dataToSave);
      alert(t("savedSuccessfully"));
    } catch (err) {
      console.error("Save error:", err);
      alert(t("saveError"));
    }
  };

  const handleShowHistory = async (row) => {
    if (!row?.data_set_id) return;
    setHistoryRow(row);
    setShowHistory(true);
    setHistoryLoading(true);
    setHistoryError(null);
    setHistoryRangePreset("30d");
    try {
      const res = await api.get(`/components/${id}/row/${row.data_set_id}/history/`);
      setHistoryData(res.data || []);
    } catch (e) {
      setHistoryError(e?.response?.data?.error || e.message);
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  };


  const formatDateInput = (date) => {
    if (!date) return "";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const computePresetRange = (preset, data) => {
    if (preset === "all") return { start: "", end: "" };
    const times = (data || [])
      .map((h) => new Date(h.time))
      .filter((d) => !isNaN(d.getTime()));
    const endDate = times.length ? new Date(Math.max(...times)) : new Date();
    const startDate = new Date(endDate);
    const daysMap = { "7d": 6, "30d": 29, "90d": 89, "1y": 364 };
    const backDays = daysMap[preset] ?? 29;
    startDate.setDate(startDate.getDate() - backDays);
    return { start: formatDateInput(startDate), end: formatDateInput(endDate) };
  };

  useEffect(() => {
    if (!showHistory || historyRangePreset === "custom") return;
    const { start, end } = computePresetRange(historyRangePreset, historyData);
    setHistoryStart(start);
    setHistoryEnd(end);
  }, [showHistory, historyRangePreset, historyData]);

  const historyFiltered = useMemo(() => {
    const start = historyStart ? new Date(historyStart) : null;
    const end = historyEnd ? new Date(historyEnd) : null;
    if (start && !isNaN(start.getTime())) start.setHours(0, 0, 0, 0);
    if (end && !isNaN(end.getTime())) end.setHours(23, 59, 59, 999);
    return (historyData || []).filter((h) => {
      const dt = h.time ? new Date(h.time) : null;
      if (!dt || isNaN(dt.getTime())) return false;
      if (start && dt < start) return false;
      if (end && dt > end) return false;
      return true;
    });
  }, [historyData, historyStart, historyEnd]);

  const historyChartData = useMemo(() => {
    const propName = historyRow?.object_type_property || "";
    const { scale, offset } = getConversionForProperty(propName);
    const points = historyFiltered
      .map((h) => {
        const dt = h.time ? new Date(h.time) : null;
        if (!dt || isNaN(dt.getTime())) return null;
        const numericCandidate = typeof h.value === "string" ? h.value.replace(",", ".") : h.value;
        if (numericCandidate === "" || numericCandidate === null || isNaN(Number(numericCandidate))) return null;
        const baseValue = Number(numericCandidate);
        const displayValue = baseValue * scale + offset;
        return { x: dt, y: displayValue };
      })
      .filter(Boolean);

    return {
      datasets: [
        {
          label: propName || (t("value") || "Value"),
          data: points,
          borderColor: "#1dacbe",
          backgroundColor: "rgba(29, 172, 190, 0.18)",
          fill: true,
          tension: 0.25,
          pointRadius: 2,
        },
      ],
    };
  }, [historyFiltered, historyRow, unitSystemMappings, selectedUnitSystemId, t]);

  const historyChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    parsing: false,
    interaction: { mode: "nearest", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
      historyDataCursor: {
        unit: getUnitForProperty(historyRow?.object_type_property || ""),
        decimals: 3,
      },
    },
    scales: {
      x: {
        type: "time",
        time: { unit: "day", tooltipFormat: "dd/MM/yyyy HH:mm" },
        grid: { display: false },
      },
      y: {
        ticks: { maxTicksLimit: 5 },
        title: {
          display: true,
          text: `${t("value") || "Value"}${historyRow?.object_type_property ? ` (${getUnitForProperty(historyRow.object_type_property) || ""})` : ""}`.trim(),
        },
      },
    },
  }), [historyRow, selectedUnitSystemId, unitSystemMappings, t]);



  if (loading) return <Spinner animation="border" />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  const colClasses = [
    "col-auto",
    "col-140",
    "col-160",
    "col-180",
    ...(showTag ? ["col-120"] : []),
    "col-160",
    "col-140",
    "col-220",
    "col-90",
  ];

  return (
    <>
    <Card className="ds-card p-4">
      <div className="d-flex justify-content-between mb-3">
        <h4 className="ds-heading">📋 {(headingLabel ?? t("eventSet"))} — {componentName}</h4>
        <Button variant="none" className="btn-brand" onClick={() => navigate(-1)}>← {t("back")}
        </Button>
      </div>
      <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
        {!readOnly && (
          <>
            <Button variant="none" className="btn-brand" onClick={addEmptyRow}>{t("addRow")}</Button>
            <Button variant="none" className="btn-brand" onClick={removeEmptyRows}>{t("removeEmpty")}</Button>
            <Button variant="none" className="btn-brand" onClick={handleSave}>💾 {t("save")}</Button>

            <Form.Group>
              <div className="d-flex align-items-center gap-2">
                <Form.Control
                  type="file"
                  id="csvFile"
                  accept=".csv"
                  onChange={handleImportFile}
                  style={{ display: "none" }}
                />
                <Button variant="none" className="btn-brand" onClick={() => document.getElementById("csvFile").click()}>
                  📎 {t("chooseFile")}
                </Button>
              </div>
            </Form.Group>
            <Button variant="none" className="btn-brand" onClick={handleExportCSV}>
              {t("csvExport")}
            </Button>

            <Form.Select className="ds-input" value={bulkEdit.field} onChange={(e) => setBulkEdit({ ...bulkEdit, field: e.target.value })} style={{ maxWidth: 150 }}>
              <option value="">{t("field")}</option>
              <option value="object_type">{t("type")}</option>
              <option value="object_instance">{t("instance")}</option>
              <option value="object_type_property">{t("property")}</option>
              <option value="value">{t("value")}</option>
              <option value="sub_data_source">{t("category")}</option>
              <option value="description">{t("description")}</option>
            </Form.Select>
            <Form.Control className="ds-input" type="text" placeholder={t("value")} value={bulkEdit.value} onChange={(e) => setBulkEdit({ ...bulkEdit, value: e.target.value })} style={{ maxWidth: 150 }} />
            <Button variant="none" className="btn-brand" onClick={handleBulkEdit}>{t("apply")}</Button>
          </>
        )}

        <Form.Control className="ds-input" type="text" placeholder={t("search")} value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ maxWidth: 220 }} />

        <Form.Select
          className="ds-input"
          value={selectedUnitSystemId || ""}
          onChange={e => setSelectedUnitSystemId(Number(e.target.value))}
          style={{ maxWidth: 300 }}
        >
          <option value="">Select Unit System</option>
          {unitSystemMappings.map(system => (
            <option key={system.unit_system_id} value={system.unit_system_id}>
              {system.unit_system_name}
            </option>
          ))}
        </Form.Select>
      </div>
      <div className="records-table">
        <div className="records-table-head" style={{ paddingRight: recordsScrollPad }}><Table bordered size="sm" className="rounded ds-table records-table-header">
          <colgroup>
            {colClasses.map((cls, idx) => (
              <col key={idx} className={cls} />
            ))}
          </colgroup>
          <thead className="ds-thead">
            <tr>
              {[
                { key: "date_time", label: t("date") },
                { key: "object_type", label: t("type") },
                { key: "object_instance", label: t("instance") },
                { key: "object_type_property", label: t("property") },
                ...(showTag ? [{ key: "tag", label: "Tag" }] : []),
                { key: "value", label: t("value") },
                { key: "sub_data_source", label: t("category") },
                { key: "description", label: t("description") },
                { key: "actions", label: t("actions") }
              ].map(({ key, label }) => (
                <th
                  key={key}
                  className={`sortable ${sortKey === key ? "sorted" : ""}`}
                  onClick={() => key !== "actions" && handleSort(key)}
                  style={{ cursor: key !== "actions" ? "pointer" : "default" }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
        </Table></div>
        <div className="records-table-body" ref={recordsBodyRef}>
          <Table bordered size="sm" className="rounded ds-table">
            <colgroup>
              {colClasses.map((cls, idx) => (
                <col key={idx} className={cls} />
              ))}
            </colgroup>
            <tbody>
              {filteredRecords.map((r, i) => {
                const realIndex = records.findIndex(x => x === r);
                const error = errorsMap[realIndex] || {};
                const dateOnly = (r.date_time || "").split('T')[0];
              const dateValue = showTime ? formatDateTimeLocal(r.date_time) : dateOnly;
                return (
                  <tr key={i}>
                  <td className={error.date_time ? 'cell-error' : ''}>
                    <Form.Control
                      className="ds-input"
                      type={showTime ? "datetime-local" : "date"}
                      value={dateValue}
                      disabled={readOnly}
                      onChange={(e) => handleChange(i, "date_time", e.target.value)}
                    />
                  </td>
                  <td className={error.object_type ? 'cell-error' : ''}>
                    <Form.Select
                      className="ds-input"
                      value={r.object_type || ""}
                      disabled={readOnly}
                      onChange={(e) => handleChange(i, "object_type", e.target.value)}>
                      <option value="">Select Type</option>
                      {typeOptions.map((t) => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </Form.Select>
                  </td>
                  <td className={error.object_instance ? 'cell-error' : ''}>
                    <Form.Select
                      className="ds-input"
                      value={r.object_instance || ""}
                      disabled={readOnly}
                      onChange={(e) => handleChange(i, "object_instance", e.target.value)}>
                      <option value="">Select Instance</option>
                      {(instanceOptions[r.object_type] || []).map((inst) => (
                        <option key={inst.id} value={inst.name}>{inst.name}</option>
                      ))}
                    </Form.Select>
                  </td>
                  <td style={{ backgroundColor: error.object_type_property ? '#ffe6e6' : 'transparent' }}>
                    <Form.Select
                      className="ds-input"
                      value={r.object_type_property || ""}
                      disabled={readOnly}
                      onChange={(e) => handleChange(i, "object_type_property", e.target.value)}>
                      <option value="">Select Property</option>
                      {(propertyOptions[r.object_type] || [])
                        .filter((prop) => prop.category !== 'Results')
                        .map((prop) => (
                        <option key={prop.id} value={prop.name}>{prop.name}</option>
                      ))}
                    </Form.Select>
                  </td>
                  {showTag && (
                    <td>
                      <Form.Control
                        className="ds-input"
                        type="text"
                        value={r.tag || ""}
                        disabled={readOnly}
                        onChange={(e) => handleChange(i, "tag", e.target.value)}
                      />
                    </td>
                  )}
                  <td className={error.object_type_property ? 'cell-error' : ''}>
                    {r.object_type_property === "Route" ? (
                      <Form.Select
                        className="ds-input"
                        value={r.value || ""}
                        onChange={e => handleChange(i, "value", e.target.value)}
                        disabled={readOnly || loadingBranches}
                      >
                        <option value="">Select Branch</option>
                        {(wellBranches[r.object_instance] || []).map((branchName, idx) => (
                          <option key={idx} value={branchName}>{branchName}</option>
                        ))}
                      </Form.Select>
                    ) : (
                      <div className="d-flex align-items-center">
                        <Form.Control
                          className="ds-input"
                          type="number"
                          disabled={readOnly}
                          value={(() => {
                            const v = r.value;
                            if (v === "" || v === null) return "";
                            // Text values — don't convert
                            if (isNaN(Number(v))) return v;
                            // Numeric values — apply conversion
                            const { scale, offset } = getConversionForProperty(r.object_type_property);
                            return (Number(v) * scale + offset).toString();
                          })()}
                          onChange={(e) => {
                            const { scale, offset } = getConversionForProperty(r.object_type_property);
                            const input = e.target.value.replace(",", "."); // allow comma as decimal
                            // Accept empty string or any string
                            if (input === "") {
                              handleChange(i, "value", "");
                            } else if (isNaN(Number(input))) {
                              // user entered text — treat as raw CharField
                              handleChange(i, "value", input);
                            } else {
                              const displayValue = Number(input);
                              const baseValue = scale !== 0 ? ((displayValue - offset) / scale) : displayValue;
                              handleChange(i, "value", baseValue);
                            }
                          }}
                          inputMode="decimal"
                          autoComplete="off"
                          spellCheck={false}
                          pattern="[0-9.,\-]*"
                          placeholder={t("value")}
                        />
                        <span className="ms-2 text-muted">
                          {getUnitForProperty(r.object_type_property)}
                        </span>
                      </div>
                    )}
                  </td>
                  <td>
                    <Form.Control
                      className="ds-input"
                      type="text"
                      value={r.sub_data_source || ""}
                      readOnly
                      disabled
                    />
                  </td>
                  <td>
                    <Form.Control
                      type="text"
                      value={r.description || ""}
                      disabled={readOnly}
                      onChange={(e) => handleChange(i, "description", e.target.value)}
                    />
                  </td>
                  <td className="text-center">
                    <Button
                      variant="none"
                      className="btn-brand me-1"
                      size="sm"
                      disabled={!r.data_set_id}
                      onClick={() => handleShowHistory(r)}
                      title={t("history") || "History"}
                    >
                      H
                    </Button>
                    {!readOnly && (
                      <Button variant="none" className="btn-danger-outline" size="sm" onClick={() => handleDeleteRow(i)}>×</Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>

        </Table>
        </div>
      </div>
    </Card>
    <Modal show={showHistory} onHide={() => setShowHistory(false)} size="xl" centered>
      <Modal.Header closeButton>
        <Modal.Title>
          {t("history") || "History"} #{historyRow?.data_set_id ?? ""}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {historyLoading ? (
          <Spinner animation="border" />
        ) : historyError ? (
          <Alert variant="danger">{String(historyError)}</Alert>
        ) : historyData.length > 0 ? (
          <div className="history-modal">
            <div className="history-summary">
              <div className="history-summary-grid">
                <div><span>Type:</span> {historyRow?.object_type || "-"}</div>
                <div><span>Instance:</span> {historyRow?.object_instance || "-"}</div>
                <div><span>Property:</span> {historyRow?.object_type_property || "-"}</div>
                <div><span>Tag:</span> {historyRow?.tag || "-"}</div>
                <div><span>Category:</span> {historyRow?.sub_data_source || "-"}</div>
              </div>
            </div>

            <div className="history-toolbar">
            <div className="history-unit-select">
              <Form.Select
                className="ds-input"
                value={selectedUnitSystemId || ""}
                onChange={e => setSelectedUnitSystemId(Number(e.target.value))}
              >
                <option value="">Select Unit System</option>
                {unitSystemMappings.map(system => (
                  <option key={system.unit_system_id} value={system.unit_system_id}>
                    {system.unit_system_name}
                  </option>
                ))}
              </Form.Select>
            </div>

              <div className="history-range-buttons">
                {[
                  { key: "7d", label: "7D" },
                  { key: "30d", label: "30D" },
                  { key: "90d", label: "90D" },
                  { key: "1y", label: "1Y" },
                  { key: "all", label: "All" },
                ].map((r) => (
                  <Button
                    key={r.key}
                    size="sm"
                    variant="none"
                    className={`btn-brand history-range-btn ${historyRangePreset === r.key ? "active" : ""}`}
                    onClick={() => setHistoryRangePreset(r.key)}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
              <div className="history-range-inputs">
                <Form.Control
                  type="date"
                  className="ds-input"
                  value={historyStart}
                  onChange={(e) => {
                    setHistoryRangePreset("custom");
                    setHistoryStart(e.target.value);
                  }}
                />
                <span className="history-range-sep">-</span>
                <Form.Control
                  type="date"
                  className="ds-input"
                  value={historyEnd}
                  onChange={(e) => {
                    setHistoryRangePreset("custom");
                    setHistoryEnd(e.target.value);
                  }}
                />
              </div>
            </div>

            <div className="history-chart">
              <Line data={historyChartData} options={historyChartOptions} height={220} />
            </div>

            <div className="history-table">
              <div className="history-table-head" style={{ paddingRight: historyScrollPad }}><Table bordered hover size="sm" className="rounded ds-table history-table-header">
                <thead className="ds-thead">
                  <tr>
                    <th>{t("time") || "Time"}</th>
                    <th>{t("value") || "Value"}</th>
                  </tr>
                </thead>
              </Table></div>
              <div className="history-table-body" ref={historyBodyRef}>
                <Table bordered hover size="sm" className="rounded ds-table">
                  <tbody>
                    {historyFiltered.map((h) => {
                      const propName = historyRow?.object_type_property || "";
                      const { scale, offset } = getConversionForProperty(propName);
                      const rawValue = h.value;
                      const numericCandidate = typeof rawValue === "string" ? rawValue.replace(",", ".") : rawValue;
                      const displayValue = !isNaN(Number(numericCandidate))
                        ? `${Number(numericCandidate) * scale + offset}`
                        : rawValue;
                      return (
                        <tr key={h.id}>
                          <td>{h.time ? new Date(h.time).toLocaleString() : ""}</td>
                          <td>
                            {displayValue ?? ""}
                            {getUnitForProperty(propName) ? ` ${getUnitForProperty(propName)}` : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            </div>
          </div>
        ) : (
          <Alert variant="info">{t("noData") || "No history yet."}</Alert>
        )}
      </Modal.Body>
    </Modal>
    </>
  );
}
