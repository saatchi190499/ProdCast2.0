import { useEffect, useState } from "react";
import api from "../../utils/axiosInstance";
import { Table, Spinner, Alert, Form, Row, Col, Button, ListGroup } from "react-bootstrap";
import { useTranslation } from "react-i18next";

export default function InstanceManagement() {
    const { t } = useTranslation();
    const [instances, setInstances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // 🔍 Search + Filter states
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedType, setSelectedType] = useState("all");

    // 🛢 Wells
    const [wells, setWells] = useState([]);
    const [loadingWells, setLoadingWells] = useState(false);
    const [errorWells, setErrorWells] = useState(null);

    // GAP file
    const [gapFile, setGapFile] = useState(null);

    // 🔽 Sort
    const [sortKey, setSortKey] = useState("object_instance_name");
    const [sortOrder, setSortOrder] = useState("asc");

    // загрузка ObjectInstance
    useEffect(() => {
        api
            .get("/object-instances/")
            .then((res) => {
                setInstances(res.data);
                setLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setLoading(false);
            });
    }, []);

    if (loading) return <Spinner animation="border" />;
    if (error) return <Alert variant="danger">{error}</Alert>;

    // Список уникальных типов
    const types = Array.from(new Set(instances.map((inst) => inst.object_type_name)));

    // Фильтрация
    let filteredInstances = instances.filter((inst) => {
        const matchesSearch = inst.object_instance_name
            .toLowerCase()
            .includes(searchTerm.toLowerCase());
        const matchesType =
            selectedType === "all" || inst.object_type_name === selectedType;
        return matchesSearch && matchesType;
    });

    // Сортировка
    filteredInstances.sort((a, b) => {
        let valA = a[sortKey];
        let valB = b[sortKey];

        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return sortOrder === "asc" ? -1 : 1;
        if (valA > valB) return sortOrder === "asc" ? 1 : -1;
        return 0;
    });

    // toggle sort
    const handleSort = (key) => {
        if (sortKey === key) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortOrder("asc");
        }
    };

    // Загрузка GAP wells
    const fetchWellsFromGap = () => {
        if (!gapFile) {
            setErrorWells("Please select a GAP file");
            return;
        }
        setLoadingWells(true);
        setErrorWells(null);

        const formData = new FormData();
        formData.append("gap_file", gapFile);

        api
            .post("/update-instances/", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            })
            .then((res) => {
                setWells(res.data.wells);
                setLoadingWells(false);
            })
            .catch((err) => {
                if (err.response && err.response.data && err.response.data.error) {
                    setErrorWells(err.response.data.error);
                } else {
                    setErrorWells(err.message);
                }
                setLoadingWells(false);
            });
    };

    return (
        <div>
            {/* Панель поиска и фильтра */}
            <Row className="mb-3">
                <Col md={6}>
                    <Form.Control
                        type="text"
                        placeholder={t("search_by_name")}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </Col>
                <Col md={4}>
                    <Form.Select
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                    >
                        <option value="all">{t("all_types")}</option>
                        {types.map((type) => (
                            <option key={type} value={type}>
                                {type}
                            </option>
                        ))}
                    </Form.Select>
                </Col>
            </Row>

            {/* Таблица ObjectInstances */}
            <div style={{ maxHeight: "70vh", overflowY: "auto", overflowX: "auto" }}>
                <Table striped bordered hover size="sm" className="rounded table-hover ds-table">
                    <thead className="sticky-top ds-thead">
                        <tr className="ds-row">
                            <th>ID</th>
                            <th>{t("object_instance")}</th>
                            <th>{t("object_type")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredInstances.map((inst) => (
                            <tr key={inst.object_instance_id}>
                                <td>{inst.object_instance_id}</td>
                                <td>{inst.object_instance_name}</td>
                                <td>{inst.object_type_name}</td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </div>


            {/* GAP file input + кнопка */}
            <div className="mt-4">
                <Row className="mb-2">
                    <Col md={8}>
                        <Form.Control
                            type="file"
                            accept=".gap"
                            onChange={(e) => setGapFile(e.target.files[0])}
                        />
                    </Col>
                    <Col md={4}>
                        <Button variant="none" className="btn-brand" onClick={fetchWellsFromGap} disabled={loadingWells}>
                            {loadingWells ? t("loading") : "Upload GAP Equipments"}
                        </Button>
                    </Col>
                </Row>

                {errorWells && (
                    <Alert variant="danger" className="mt-2">
                        <strong>Error:</strong> {errorWells}
                    </Alert>
                )}

                {wells.length > 0 && (
                    <ListGroup className="mt-3">
                        {wells.map((well, idx) => (
                            <ListGroup.Item key={idx}>{well}</ListGroup.Item>
                        ))}
                    </ListGroup>
                )}
            </div>
        </div>
    );
}
