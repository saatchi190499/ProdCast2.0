import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../utils/axiosInstance";
import { Card, Table, Button, Form, Spinner, Alert } from "react-bootstrap";
import { saveAs } from "file-saver";
import Papa from "papaparse";
import { useTranslation } from "react-i18next";
import useWellBranches from "./useWellBranches";
import "../DataSourcePage.css";


export default function EventRecordsPage({ apiPathPrefix = "events", headingLabel } = {}) {
  const { wellBranches, loadingBranches, errorBranches } = useWellBranches();
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

  const [typeOptions, setTypeOptions] = useState([]);
  const [instanceOptions, setInstanceOptions] = useState({});
  const [propertyOptions, setPropertyOptions] = useState({});

  const [selectedUnitSystemId, setSelectedUnitSystemId] = useState(null);
  const [unitSystemMappings, setUnitSystemMappings] = useState([]);
  const emptyRow = {
    date_time: "", object_type: "", object_instance: "", object_type_property: "",
    value: "", sub_data_source: "", description: ""
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
      } catch {}

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



  if (loading) return <Spinner animation="border" />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <Card className="ds-card p-4">
      <div className="d-flex justify-content-between mb-3">
        <h4 className="ds-heading">📋 {(headingLabel ?? t("eventSet"))} — {componentName}</h4>
        <Button variant="none" className="btn-brand" onClick={() => navigate(-1)}>← {t("back")}
        </Button>
      </div>
      <div className="d-flex flex-wrap gap-2 mb-3">
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
        <Form.Control className="ds-input" type="text" placeholder={t("search")} value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ maxWidth: 200 }} />
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
      <div className="brand-scroll" style={{ maxHeight: "calc(100vh - 300px)", overflowY: "auto" }}>
        <Table bordered size="sm" className="rounded ds-table">
          <thead className="ds-thead sticky-top">
            <tr>
              {[
                { key: "date_time", label: t("date") },
                { key: "object_type", label: t("type") },
                { key: "object_instance", label: t("instance") },
                { key: "object_type_property", label: t("property") },
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

          <tbody>
            {filteredRecords.map((r, i) => {
              const realIndex = records.findIndex(x => x === r);
              const error = errorsMap[realIndex] || {};
              const dateOnly = r.date_time.split('T')[0];
              return (
                <tr key={i}>
                  <td className={error.date_time ? 'cell-error' : ''}>
                    <Form.Control
                      className="ds-input"
                      type="date"
                      value={dateOnly}
                      onChange={(e) => handleChange(i, "date_time", e.target.value)}
                    />
                  </td>
                  <td className={error.object_type ? 'cell-error' : ''}>
                    <Form.Select
                      className="ds-input"
                      value={r.object_type || ""}
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
                      onChange={(e) => handleChange(i, "object_type_property", e.target.value)}>
                      <option value="">Select Property</option>
                      {(propertyOptions[r.object_type] || [])
                        .filter((prop) => prop.category !== 'Results')
                        .map((prop) => (
                        <option key={prop.id} value={prop.name}>{prop.name}</option>
                      ))}
                    </Form.Select>
                  </td>
                  <td className={error.object_type_property ? 'cell-error' : ''}>
                    {r.object_type_property === "Route" ? (
                      <Form.Select
                        className="ds-input"
                        value={r.value || ""}
                        onChange={e => handleChange(i, "value", e.target.value)}
                        disabled={loadingBranches}
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
                      onChange={(e) => handleChange(i, "description", e.target.value)}
                    />
                  </td>
                  <td className="text-center">
                    <Button variant="none" className="btn-danger-outline" size="sm" onClick={() => handleDeleteRow(i)}>🗑</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>

        </Table>
      </div>
    </Card>
  );
}
