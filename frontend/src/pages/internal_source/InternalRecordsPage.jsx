import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert, Spinner } from "react-bootstrap";
import api from "../../utils/axiosInstance";
import EventRecordsPage from "../events/EventRecordsPage";

export default function InternalRecordsPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("SERIES");

  useEffect(() => {
    let isMounted = true;
    api
      .get(`/components/${id}/`)
      .then((res) => {
        if (!isMounted) return;
        setMode(res.data.internal_mode || "SERIES");
        setLoading(false);
      })
      .catch((e) => {
        if (!isMounted) return;
        setError(e?.response?.data?.error || e.message);
        setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) return <Spinner animation="border" />;
  if (error) return <Alert variant="danger">{String(error)}</Alert>;

  const readOnly = mode === "SERIES";
  const headingLabel = mode === "CONSTANTS" ? "Internal (Constants)" : "Internal (Series)";

  return <EventRecordsPage apiPathPrefix="internal" headingLabel={headingLabel} readOnly={readOnly} showTag />;
}
