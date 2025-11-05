import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../utils/axiosInstance";
import { Card, Table, Button, Form, Spinner, Alert } from "react-bootstrap";
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
    "CurrentGasRat",
    "Temperature",
    "OIIP",
    "GIIP",
  ];

  const toArray = (val) =>
    typeof val === "string"
      ? val.split(",").map((s) => s.trim())
      : Array.isArray(val)
      ? val
      : [];

  const buildRowsFromInstance = (instanceName, props) => {
    const mapForInstance = existingMap[instanceName] || {};
    const arrays = props.map((p) => toArray(mapForInstance[p]?.value || ""));
    const rowCount = Math.max(1, ...arrays.map((a) => a.length));
    const newRows = Array.from({ length: rowCount }, (_, i) => {
      const r = {};
      props.forEach((p, idx) => {
        r[p] = arrays[idx][i] ?? "";
      });
      return r;
    });
    setRows(newRows);
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

        // choose preferred props present in TANK property list
        const availablePropNames = new Set(tankPropsFromRes.map((p) => p.name));
        const initialProps = preferredProps.filter((p) => availablePropNames.has(p));
        setSelectedProps(initialProps.length ? initialProps : Array.from(availablePropNames).slice(0, 4));

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
  }, [selectedInstance, selectedProps, existingMap, loading]);

  const handlePropToggle = (propName) => {
    setSelectedProps((prev) => {
      const set = new Set(prev);
      if (set.has(propName)) set.delete(propName);
      else set.add(propName);
      const arr = Array.from(set);
      // rebuild rows with new props
      buildRowsFromInstance(selectedInstance, arr);
      return arr;
    });
  };

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
        const selectedLower = new Set(selectedProps.map(norm));
        const remapped = rowsForInstance.map((r) => {
          const out = {};
          for (const p of selectedProps) {
            const key = Object.keys(r).find((k) => norm(k) === norm(p));
            out[p] = key ? String(r[key] ?? "") : "";
          }
          return out;
        });
        setRows(remapped);
      },
      error: (err) => alert(err.message),
    });
  };

  const handleSave = async () => {
    try {
      // Build payload: one record per property
      const payload = selectedProps.map((propName) => {
        const colVals = rows.map((r) => (r?.[propName] ?? "").toString().trim());
        const csv = colVals.join(",");
        const existing = existingMap[selectedInstance]?.[propName];
        const typeId = typeOptions.find((t) => t.name === TANK)?.id;
        const instanceId = tankInstances.find((i) => i.name === selectedInstance)?.id;
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
      </div>

      <div className="mb-3">
        <div className="fw-semibold mb-2">{t("properties") || "Properties"}</div>
        <div className="d-flex flex-wrap gap-3">
          {tankProperties.map((p) => (
            <Form.Check
              key={p.id}
              type="checkbox"
              label={p.name}
              checked={selectedProps.includes(p.name)}
              onChange={() => handlePropToggle(p.name)}
            />
          ))}
        </div>
      </div>

      <div className="brand-scroll" style={{ maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
        <Table bordered size="sm" className="rounded ds-table">
          <thead className="ds-thead sticky-top">
            <tr>
              <th>#</th>
              {selectedProps.map((p) => (
                <th key={p}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                {selectedProps.map((p) => (
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
    </Card>
  );
}
