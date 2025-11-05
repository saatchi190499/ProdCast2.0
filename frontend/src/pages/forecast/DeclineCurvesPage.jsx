import { useEffect, useMemo, useState } from "react";
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

  const tankInstances = useMemo(
    () => instanceOptionsByType[TANK] || [],
    [instanceOptionsByType]
  );
  const tankProperties = useMemo(
    () => propertyOptionsByType[TANK] || [],
    [propertyOptionsByType]
  );

  const preferredProps = [
    "ReservoirPressure",
    "CumGasProd",
  ];

  const SINGLE_VALUE_PROPS = new Set([
    "CurrentGasProd",
    "FLUIDTEMP",
    "GasInPlace",
    "OilInPlace",
  ]);

  const toArray = (val) =>
    typeof val === "string"
      ? val.split("|").map((s) => s.trim())
      : Array.isArray(val)
      ? val
      : [];

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

        // Use all TANK properties (show all; no checkboxes)
        const availablePropNames = new Set(tankPropsFromRes.map((p) => p.name));
        setSelectedProps(Array.from(availablePropNames));

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

  const addRow = () => {
    const last = rows[rows.length - 1] || {};
    const empty = {};
    selectedProps.forEach((p) => (empty[p] = ""));
    setRows([...rows, { ...empty }]);
  };

  const removeLastRow = () => {
    if (rows.length > 0) setRows(rows.slice(0, -1));
  };

  const handleCellChange = (rowIdx, prop, value) => {
    const copy = [...rows];
    copy[rowIdx] = { ...(copy[rowIdx] || {}), [prop]: value };
    setRows(copy);
  };

  const handleImportCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rowsForInstance = res.data.filter((r) => String(r.Name || "").trim() === selectedInstance);
        if (!rowsForInstance.length) {
          alert(`No rows for instance ${selectedInstance}`);
          return;
        }
        // Map CSV columns to selected properties (case-insensitive)
        const norm = (s) => String(s || "").trim().toLowerCase();
        const seriesProps = selectedProps.filter((p) => !SINGLE_VALUE_PROPS.has(p));
        const remapped = rowsForInstance.map((r) => {
          const out = {};
          for (const p of seriesProps) {
            const key = Object.keys(r).find((k) => norm(k) === norm(p));
            out[p] = key ? String(r[key] ?? "") : "";
          }
          return out;
        });
        setRows(remapped);

        const singles = {};
        selectedProps
          .filter((p) => SINGLE_VALUE_PROPS.has(p))
          .forEach((p) => {
            const key = Object.keys(rowsForInstance[0]).find((k) => norm(k) === norm(p));
            let val = "";
            if (key) {
              for (const r of rowsForInstance) {
                const cell = r[key];
                if (cell !== undefined && String(cell).trim() !== "") {
                  val = String(cell);
                  break;
                }
              }
            }
            singles[p] = val;
          });
        setSingleValues((prev) => ({ ...prev, ...singles }));
      },
      error: (err) => alert(err.message),
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

      // Build header: Name + series columns (+ single columns at end)
      const header = ["Name", ...seriesProps, ...singleProps];

      // Build one CSV row per series row
      const lines = rows.map((r, idx) => {
        const rowOut = { Name: selectedInstance };
        seriesProps.forEach((p) => {
          rowOut[p] = String(r?.[p] ?? "").trim();
        });
        if (idx === 0) {
          singleProps.forEach((p) => {
            rowOut[p] = String(singleValues[p] ?? "").trim();
          });
        } else {
          singleProps.forEach((p) => { rowOut[p] = ""; });
        }
        singleProps.forEach((p) => {
          rowOut[p] = String(singleValues[p] ?? "").trim();
        });
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
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const handleApplyPaste = () => {
    const res = Papa.parse(pasteText, { header: true, skipEmptyLines: true });
    const data = Array.isArray(res.data) ? res.data : [];
    let rowsForInstance = data;
    if (data.length && Object.prototype.hasOwnProperty.call(data[0], "Name")) {
      rowsForInstance = data.filter((r) => String(r.Name || "").trim() === selectedInstance);
    }
    if (!rowsForInstance.length) {
      alert(`No rows for instance ${selectedInstance}`);
      return;
    }
    const norm = (s) => String(s || "").trim().toLowerCase();
    const seriesProps = selectedProps.filter((p) => !SINGLE_VALUE_PROPS.has(p));
    const remapped = rowsForInstance.map((r) => {
      const out = {};
      for (const p of seriesProps) {
        const key = Object.keys(r).find((k) => norm(k) === norm(p));
        out[p] = key ? String(r[key] ?? "") : "";
      }
      return out;
    });
    setRows(remapped);

    const singles = {};
    selectedProps
      .filter((p) => SINGLE_VALUE_PROPS.has(p))
      .forEach((p) => {
        const key = Object.keys(rowsForInstance[0]).find((k) => norm(k) === norm(p));
        let val = "";
        if (key) {
          for (const r of rowsForInstance) {
            const cell = r[key];
            if (cell !== undefined && String(cell).trim() !== "") {
              val = String(cell);
              break;
            }
          }
        }
        singles[p] = val;
      });
    setSingleValues((prev) => ({ ...prev, ...singles }));
    setShowPaste(false);
    setPasteText("");
  };

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

      const seriesPayload = seriesProps.map((propName) => {
        const colVals = rows.map((r) => (r?.[propName] ?? "").toString().trim());
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
        const val = (singleValues[propName] ?? "").toString().trim();
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
    <Card className="ds-card p-4">
      <div className="d-flex justify-content-between mb-3 align-items-center">
        <h4 className="ds-heading">{t("Decline Curves") || "Decline Curves"} · {componentName}</h4>
        <div className="d-flex gap-2">
          <Button variant="none" className="btn-secondary" onClick={addRow}>{t("addRow") || "Add Row"}</Button>
          <Button variant="none" className="btn-secondary" onClick={removeLastRow}>{t("remove") || "Remove Last"}</Button>
          <Button variant="none" className="btn-brand" onClick={handleSave}>{t("save") || "Save"}</Button>
          <Button variant="none" className="btn-secondary" onClick={handleExportCSV}>{t("export") || "Export CSV"}</Button>
          <Button variant="none" className="btn-secondary" onClick={() => navigate(-1)}>{t("back") || "Back"}</Button>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-3 align-items-end mb-3">
        <Form.Group>
          <Form.Label>{t("instance") || "Instance"}</Form.Label>
          <Form.Select
            className="ds-input"
            value={selectedInstance}
            onChange={(e) => setSelectedInstance(e.target.value)}
            style={{ minWidth: 240 }}
          >
            {tankInstances.map((i) => (
              <option key={i.id} value={i.name}>{i.name}</option>
            ))}
          </Form.Select>
        </Form.Group>

        <Form.Group>
          <Form.Label>{t("importCSV") || "Import CSV"}</Form.Label>
          <Form.Control className="ds-input" type="file" accept=".csv" onChange={handleImportCSV} />
        </Form.Group>

        <Form.Group>
          <Form.Label>{t("pasteData") || "Paste Data"}</Form.Label>
          <div>
            <Button variant="none" className="btn-secondary" onClick={() => setShowPaste(true)}>
              {t("paste") || "Paste"}
            </Button>
          </div>
        </Form.Group>
      </div>

      <div className="mb-3">
        <div className="fw-semibold mb-2">{t("properties") || "Properties"}</div>
        <div className="text-muted">{t("showingAllProperties") || "Showing all properties for TANK."}</div>
      </div>

      {selectedProps.some((p) => SINGLE_VALUE_PROPS.has(p)) && (
        <div className="mb-3">
          <div className="fw-semibold mb-2">{t("singleValues") || "Single Values"}</div>
          <div className="d-flex flex-wrap gap-3">
            {selectedProps.filter((p) => SINGLE_VALUE_PROPS.has(p)).map((p) => (
              <Form.Group key={p} style={{ minWidth: 220 }}>
                <Form.Label>{p}</Form.Label>
                <Form.Control
                  className="ds-input"
                  value={singleValues[p] ?? ""}
                  onChange={(e) => setSingleValues((prev) => ({ ...prev, [p]: e.target.value }))}
                />
              </Form.Group>
            ))}
          </div>
        </div>
      )}

      <div className="brand-scroll" style={{ maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
        <Table bordered size="sm" className="rounded ds-table">
          <thead className="ds-thead sticky-top">
            <tr>
              <th>#</th>
              {selectedProps.filter((p) => !SINGLE_VALUE_PROPS.has(p)).map((p) => (
                <th key={p}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                {selectedProps.filter((p) => !SINGLE_VALUE_PROPS.has(p)).map((p) => (
                  <td key={p}>
                    <Form.Control
                      className="ds-input"
                      value={r?.[p] ?? ""}
                      onChange={(e) => handleCellChange(idx, p, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      {showPaste && (
        <div className="modal show" style={{ display: 'block' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{t("pasteData") || "Paste Data"}</h5>
                <button type="button" className="btn-close" onClick={() => setShowPaste(false)} />
              </div>
              <div className="modal-body">
                <Form.Control
                  as="textarea"
                  rows={10}
                  className="ds-input"
                  placeholder={"Paste CSV with headers (Name, property columns)"}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <Button variant="none" className="btn-ghost" onClick={() => setShowPaste(false)}>
                  {t("cancel") || "Cancel"}
                </Button>
                <Button variant="none" className="btn-brand" onClick={handleApplyPaste}>
                  {t("apply") || "Apply"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}