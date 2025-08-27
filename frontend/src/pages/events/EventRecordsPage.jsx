import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../utils/axiosInstance";
import { Card, Table, Button, Form, Spinner, Alert } from "react-bootstrap";
import { saveAs } from "file-saver";
import Papa from "papaparse";
import { useTranslation } from "react-i18next";


export default function EventRecordsPage() {
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
      const prop = Object.values(propertyMap).flat().find((x) => x.id === r.object_type_property);

      return {
        ...r,
        object_type: typeList.find((t) => t.id === r.object_type)?.name || "",
        object_instance: Object.values(instanceMap).flat().find((x) => x.id === r.object_instance)?.name || "",
        object_type_property: prop?.name || "",
        unit: prop?.unit || "",// Access the unit name
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

        const recordsRes = await api.get(`/components/${id}/events/`);

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
      if (!validInstances.find(x => x.name === r.object_instance)) r.object_instance = "";
      if (!validProps.find(x => x.name === r.object_type_property)) r.object_type_property = "";
      return r;
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
            if (d && m && y) {
              cleanRow.date_time = `${y.padStart(4, "20")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
            } else {
              cleanRow.date_time = "";
            }
          }
          return cleanRow;
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
    const exportKeys = [
      "date_time",
      "object_type",
      "object_instance",
      "object_type_property",
      "value",
      "sub_data_source",
      "description"
    ];
    const header = exportKeys.join(",");
    const rows = records.map(r =>
      exportKeys.map(k => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(",")
    );
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
      updated[realIndex]["unit"] = ""; // Clear the unit as well
    } else if (field === "object_type_property") {
      // Find the selected property object from the options
      const selectedProp = propertyOptions[updated[realIndex].object_type]?.find(
        (p) => p.name === value
      );
      // Update the unit with the unit from the selected property
      updated[realIndex]["unit"] = selectedProp?.unit || "";
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

      return {
        ...r,
        object_type: typeId,
        object_instance: instanceId,
        object_type_property: propId,
        sub_data_source: r.sub_data_source?.trim() === "" ? null : r.sub_data_source,
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
      await api.post(`/components/${id}/events/`, dataToSave);
      alert(t("savedSuccessfully"));
    } catch (err) {
      console.error("Save error:", err);
      alert(t("saveError"));
    }
  };



  if (loading) return <Spinner animation="border" />;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <Card className="p-4">
      <div className="d-flex justify-content-between mb-3">
        <h4>📋 {t("eventSet")} — {componentName}</h4>
        <Button variant="outline-secondary" onClick={() => navigate(-1)}>←  {t("back")}</Button>
      </div>
      <div className="d-flex flex-wrap gap-2 mb-3">
        <Button onClick={addEmptyRow}>➕ {t("addRow")}</Button>
        <Button onClick={removeEmptyRows}>🧹 {t("removeEmpty")}</Button>
        <Button onClick={handleSave}>💾 {t("save")}</Button>
        <Form.Group>
          <div className="d-flex align-items-center gap-2">
            <Form.Control
              type="file"
              id="csvFile"
              accept=".csv"
              onChange={handleImportFile}
              style={{ display: "none" }}
            />
            <Button
              variant="outline-secondary"
              onClick={() => document.getElementById("csvFile").click()}
            >
              📎 {t("chooseFile")}
            </Button>
          </div>
        </Form.Group>
        <Button variant="outline-success" onClick={handleExportCSV}>
          {t("csvExport")}
        </Button>
        <Form.Control type="text" placeholder={t("search")} value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ maxWidth: 200 }} />
        <Form.Select value={bulkEdit.field} onChange={(e) => setBulkEdit({ ...bulkEdit, field: e.target.value })} style={{ maxWidth: 150 }}>
          <option value="">{t("field")}</option>
          <option value="object_type">{t("type")}</option>
          <option value="object_instance">{t("instance")}</option>
          <option value="object_type_property">{t("property")}</option>
          <option value="value">{t("value")}</option>
          <option value="sub_data_source">{t("category")}</option>
          <option value="description">{t("description")}</option>
        </Form.Select>
        <Form.Control type="text" placeholder={t("value")} value={bulkEdit.value} onChange={(e) => setBulkEdit({ ...bulkEdit, value: e.target.value })} style={{ maxWidth: 150 }} />
        <Button variant="outline-primary" onClick={handleBulkEdit}>⚙ {t("apply")}</Button>

        <Form.Select
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
      <div style={{ maxHeight: "calc(100vh - 300px)", overflowY: "auto" }}>
        <Table bordered size="sm" className="rounded">
          <thead>
            <tr className="table-secondary sticky-top">
              {[
                { key: "date_time", label: t("date") },
                { key: "object_type", label: t("type") },
                { key: "object_instance", label: t("instance") },
                { key: "object_type_property", label: t("property") },
                { key: "value", label: t("value") },
                { key: "sub_data_source", label: t("category") },
                { key: "description", label: t("description") },
                { key: "actions", label: t("actions") }
              ].map(({ key, label }, idx) => (
                <th
                  key={idx}
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
                  <td style={{ backgroundColor: error.date_time ? '#ffe6e6' : 'transparent' }}>
                    <Form.Control
                      type="date"
                      value={dateOnly}
                      onChange={(e) => handleChange(i, "date_time", e.target.value)}
                    />
                  </td>
                  <td style={{ backgroundColor: error.object_type ? '#ffe6e6' : 'transparent' }}>
                    <Form.Select
                      value={r.object_type || ""}
                      onChange={(e) => handleChange(i, "object_type", e.target.value)}>
                      <option value="">Select Type</option>
                      {typeOptions.map((t) => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </Form.Select>
                  </td>
                  <td style={{ backgroundColor: error.object_instance ? '#ffe6e6' : 'transparent' }}>
                    <Form.Select
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
                      value={r.object_type_property || ""}
                      onChange={(e) => handleChange(i, "object_type_property", e.target.value)}>
                      <option value="">Select Property</option>
                      {(propertyOptions[r.object_type] || []).map((prop) => (
                        <option key={prop.id} value={prop.name}>{prop.name}</option>
                      ))}
                    </Form.Select>
                  </td>
                  <td style={{ backgroundColor: error.value ? '#ffe6e6' : 'transparent' }}>
                    <div className="d-flex align-items-center">
                      <Form.Control
                        type="number"
                        value={(() => {
                          // Show the input as-is if not a valid number
                          const { scale, offset } = getConversionForProperty(r.object_type_property);
                          const rawValue = Number(r.value);
                          if (typeof r.value === "string" && isNaN(rawValue)) return r.value;
                          if (r.value === "" || r.value === null) return "";
                          // Only convert if it's a valid number
                          return (rawValue * scale + offset) || "";
                        })()}
                        onChange={(e) => {
                          const { scale, offset } = getConversionForProperty(r.object_type_property);
                          const input = e.target.value.replace(",", "."); // allow comma as decimal
                          // Accept empty string or any string
                          if (input === "" || isNaN(Number(input))) {
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
                  </td>
                  <td>
                    <Form.Control
                      type="text"
                      value={r.sub_data_source || ""}
                      onChange={(e) => handleChange(i, "sub_data_source", e.target.value)}
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
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDeleteRow(i)}>
                      🗑
                    </Button>
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
