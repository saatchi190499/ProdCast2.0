import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../../utils/axiosInstance";
import { Card, Table, Button, Form, Spinner, Alert, Modal } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import "../../DataSourcePage.css";

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
} from "chart.js";
import "chartjs-adapter-date-fns";

ChartJS.register(TimeScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function PIRecordsPage() {
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

    const [typeOptions, setTypeOptions] = useState([]);
    const [instanceOptions, setInstanceOptions] = useState({});
    const [propertyOptions, setPropertyOptions] = useState({});

    // Modal for history
    const [showHistory, setShowHistory] = useState(false);
    const [selectedRow, setSelectedRow] = useState(null);
    const [historyData, setHistoryData] = useState([]);
    function toLocalISOString(date) {
        const offsetMs = date.getTimezoneOffset() * 60000;
        const local = new Date(date.getTime() - offsetMs);
        return local.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm (24h)
    }

    function toLocalISOString(date) {
        const offsetMs = date.getTimezoneOffset() * 60000;
        const local = new Date(date.getTime() - offsetMs);
        return local.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm (24h)
    }

    const [startTime, setStartTime] = useState(() => {
        const now = new Date();
        const oneMonthAgo = new Date(now);
        oneMonthAgo.setMonth(now.getMonth() - 1);
        return toLocalISOString(oneMonthAgo);
    });

    const [endTime, setEndTime] = useState(() => toLocalISOString(new Date()));



    const [interval, setInterval] = useState("1d");

    const emptyRow = {
        object_type: "",
        object_instance: "",
        object_type_property: "",
        tag: "",
        value: "",
        date_time: "",
    };

    const convertIdsToNames = (data, typeList, instanceMap, propertyMap) =>
        data.map((r) => {
            const typeName = typeList.find((t) => t.id === r.object_type)?.name || "";
            const instanceName = Object.values(instanceMap).flat().find((x) => x.id === r.object_instance)?.name || "";
            const propObj = Object.values(propertyMap).flat().find((x) => x.id === r.object_type_property);
            return {
                ...r,
                object_type: typeName,
                object_instance: instanceName,
                object_type_property: propObj?.name || "",
            };
        });

    const validateRow = (r) => ({
        object_type: !r.object_type?.trim?.(),
        object_instance: !r.object_instance?.trim?.(),
        object_type_property: !r.object_type_property?.trim?.(),
        tag: !r.tag?.trim?.(),
    });

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

                const recordsRes = await api.get(`/components/pi-records/${id}/`);
                const converted = convertIdsToNames(recordsRes.data, types, instances, properties);
                setRecords(converted);
                setLoading(false);
            } catch (err) {
                console.error(err);
                setError(t("loadError"));
                setRecords([emptyRow]);
                setLoading(false);
            }
        };
        fetchAll();
    }, [id]);

    useEffect(() => { applyFiltersAndSorting(records); }, [records, searchText, sortKey, sortAsc]);
    useEffect(() => {
        return () => {
            ChartJS.getChart("0")?.destroy(); // safely destroy old chart if any
        };
    }, [showHistory]);
    const handleChange = (filteredIndex, field, value) => {
        const realIndex = records.findIndex((r) => r === filteredRecords[filteredIndex]);
        if (realIndex === -1) return;
        const updated = [...records];
        updated[realIndex][field] = value;
        setRecords(updated);
    };

    const addEmptyRow = () => {
        const updated = [...records, { ...emptyRow }];
        setRecords(updated);
        applyFiltersAndSorting(updated);
    };

    const handleDeleteRow = (filteredIndex) => {
        const realIndex = records.findIndex((r) => r === filteredRecords[filteredIndex]);
        if (realIndex === -1) return;
        const updated = [...records];
        updated.splice(realIndex, 1);
        setRecords(updated);
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
            };
        });
    };

    const handleSave = async () => {
        try {
            const dataToSave = convertNamesToIds(records);
            const res = await api.post(`/components/pi-records/${id}/`, dataToSave);

            // Build map of backend results (keyed by ID)
            const resultMap = Object.fromEntries(
                res.data.filter(r => r.id).map(r => [r.id, r])
            );

            // Merge returned live PI values
            const updatedRecords = records.map(row => {
                const backendRow = resultMap[row.data_set_id];
                if (backendRow) {
                    return {
                        ...row,
                        value: backendRow.value ?? row.value,
                        date_time: backendRow.date_time ?? row.date_time,
                    };
                }
                return row;
            });

            setRecords(updatedRecords);
            applyFiltersAndSorting(updatedRecords);
            alert(t("savedSuccessfully"));
        } catch (err) {
            console.error("Save error:", err);
            alert(t("saveError"));
        }
    };





    // 📡 Fetch single PI value
    const handleFetchValue = async (rowId) => {
        try {
            const res = await api.post(`/components/pi-records/${id}/row/${rowId}/fetch_value/`);
            const updated = records.map((r) =>
                r.data_set_id === res.data.id ? { ...r, value: res.data.value, date_time: res.data.date_time } : r
            );
            setRecords(updated);
        } catch (err) {
            console.error("Fetch value error:", err);
            alert(t("fetchError"));
        }
    };

    // 📈 Open history modal
    const handleShowHistory = async (row) => {
        setSelectedRow(row);
        setShowHistory(true);
        await fetchHistory(row);
    };

    const fetchHistory = async (row) => {
        try {
            const res = await api.get(`/components/pi-records/${id}/row/${row.data_set_id}/history/`, {
                params: { start: startTime, end: endTime, interval },
            });
            setHistoryData(res.data);
        } catch (err) {
            console.error("History error:", err);
            setHistoryData([]);
        }
    };



    const chartData = {
        datasets: [
            {
                label: selectedRow ? selectedRow.tag : "",
                data: historyData.map((p) => ({
                    x: new Date(p.Timestamp),
                    y: p.Value,
                })),
                borderColor: "#1DACBE",
                borderWidth: 2,
                fill: false,
            },
        ],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                type: "time",
                time: {
                    unit: "day", // or "hour", depending on interval
                    tooltipFormat: "dd/MM/yyyy HH:mm",
                    displayFormats: {
                        hour: "dd MMM HH:mm",
                        day: "dd MMM",
                    },
                },
                ticks: {
                    maxRotation: 45,
                    minRotation: 30,
                    autoSkip: true,
                    maxTicksLimit: 8,
                },
            },
            y: {
                beginAtZero: false,
            },
        },
        plugins: {
            legend: {
                display: true,
                position: "top",
            },
            tooltip: {
                mode: "index",
                intersect: false,
            },
        },
    };


    if (loading) return <Spinner animation="border" />;
    if (error) return <Alert variant="danger">{error}</Alert>;

    return (
        <>
            <Card className="ds-card p-4">
                <div className="d-flex justify-content-between mb-3">
                    <h4 className="ds-heading">🧩 {t("piRecords")} — {componentName}</h4>
                    <Button variant="none" className="btn-brand" onClick={() => navigate(-1)}>← {t("back")}</Button>
                </div>

                <div className="d-flex flex-wrap gap-2 mb-3">
                    <Button variant="none" className="btn-brand" onClick={addEmptyRow}>{t("addRow")}</Button>
                    <Button variant="none" className="btn-brand" onClick={handleSave}>💾 {t("save")}</Button>
                    <Form.Control className="ds-input" type="text" placeholder={t("search")} value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ maxWidth: 200 }} />
                </div>

                <div className="brand-scroll" style={{ maxHeight: "calc(100vh - 300px)", overflowY: "auto" }}>
                    <Table bordered size="sm" className="rounded ds-table">
                        <thead className="ds-thead sticky-top">
                            <tr>
                                <th>{t("type")}</th>
                                <th>{t("instance")}</th>
                                <th>{t("property")}</th>
                                <th>{t("tag")}</th>
                                <th>{t("value")}</th>
                                <th>{t("date")}</th>
                                <th>{t("actions")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecords.map((r, i) => (
                                <tr key={i}>
                                    <td>
                                        <Form.Select value={r.object_type || ""} onChange={(e) => handleChange(i, "object_type", e.target.value)}>
                                            <option value="">Select Type</option>
                                            {typeOptions.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                                        </Form.Select>
                                    </td>
                                    <td>
                                        <Form.Select value={r.object_instance || ""} onChange={(e) => handleChange(i, "object_instance", e.target.value)}>
                                            <option value="">Select Instance</option>
                                            {(instanceOptions[r.object_type] || []).map((inst) => (
                                                <option key={inst.id} value={inst.name}>{inst.name}</option>
                                            ))}
                                        </Form.Select>
                                    </td>
                                    <td>
                                        <Form.Select value={r.object_type_property || ""} onChange={(e) => handleChange(i, "object_type_property", e.target.value)}>
                                            <option value="">Select Property</option>
                                            {(propertyOptions[r.object_type] || []).map((prop) => (
                                                <option key={prop.id} value={prop.name}>{prop.name}</option>
                                            ))}
                                        </Form.Select>
                                    </td>
                                    <td>
                                        <Form.Control value={r.tag || ""} onChange={(e) => handleChange(i, "tag", e.target.value)} placeholder="\\\\Server\\Path|PI: Tag" />
                                    </td>
                                    <td>{r.value ?? ""}</td>
                                    <td>{r.date_time ? new Date(r.date_time).toLocaleString() : ""}</td>
                                    <td className="text-center">
                                        <Button variant="none" className="btn-brand me-1" size="sm" onClick={() => handleFetchValue(r.data_set_id)}>📡</Button>
                                        <Button variant="none" className="btn-brand" size="sm" onClick={() => handleShowHistory(r)}>📈</Button>
                                        <Button variant="none" className="btn-danger-outline" size="sm" onClick={() => handleDeleteRow(i)}>🗑</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </div>
            </Card>

            {/* 📈 History Modal */}
            <Modal show={showHistory} onHide={() => setShowHistory(false)} size="lg" centered>
                <Modal.Header closeButton>
                    <Modal.Title>📈 {selectedRow?.tag || t("history")}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div className="d-flex gap-2 mb-3">
                        <Form.Control
                            type="datetime-local"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                        />
                        <Form.Control
                            type="datetime-local"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                        />


                        <Form.Select value={interval} onChange={(e) => setInterval(e.target.value)}>
                            <option value="1d">1d</option>
                            <option value="1h">1h</option>
                            <option value="30m">30m</option>
                            <option value="15m">15m</option>
                            <option value="5m">5m</option>
                        </Form.Select>
                        <Button variant="none" className="btn-brand" onClick={() => fetchHistory(selectedRow)}>🔄 {t("reload")}</Button>
                    </div>
                    {historyData.length > 0 ? (
                        <div style={{ height: "400px", width: "100%", position: "relative" }}>
                            <Line data={chartData} options={chartOptions} height={400} />
                        </div>

                    ) : (
                        <Alert variant="info">{t("noData")}</Alert>
                    )}
                </Modal.Body>
            </Modal>
        </>
    );
}
