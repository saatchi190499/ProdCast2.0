import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import Settings from "../pages/Settings";
import EventRecordsPage from "../pages/events/EventRecordsPage";
import EventComparePage from "../pages/events/EventComparePage";
import NotebookEditor from "../pages/notebook/NotebookEditor";
import PiRecordsPage from "../pages/external_source/pi/PiRecordsPage";
import InternalRecordsPage from "../pages/internal_source/InternalRecordsPage";
import { PetexTipsProvider } from "../pages/notebook/context/PetexTipsContext";
import VisualAnalysisBuilder from "../pages/visual/VisualAnalysisBuilder";
import DeclineCurvesPage from "../pages/forecast/DeclineCurvesPage";
import DataSourcePage from "../pages/DataSourcePage";
import Scenarios from "../pages/scenario/Scenarios";
import Scheduler from "../pages/scheduler/WorkflowSchedulerPage";
import ScenarioResultsPage from "../pages/results/ScenarioResultsPage";
import { isAuthenticated } from "../utils/auth";
import MainLayout from "../layouts/MainLayout";

function PrivateRoute({ children }) {
  return isAuthenticated() ? children : <Navigate to="/login" replace />;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public route */}
        <Route path="/login" element={<Login />} />

        {/* Protected layout with Outlet */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }
        >
          {/* Child routes MUST be relative (no leading slash) to render inside <Outlet /> */}
          <Route index element={<Dashboard />} />
          <Route path=":sourceType/:sourceName" element={<DataSourcePage />} />
          <Route path="components/events/:id" element={<EventRecordsPage />} />
          <Route path="components/internal/:id" element={<InternalRecordsPage />} />
          <Route path="components/events/compare" element={<EventComparePage />} />
          <Route path="components/visual-analysis/:id" element={<VisualAnalysisBuilder />} />
          <Route path="components/decline-curves/:id" element={<DeclineCurvesPage />} />
          {/* <Route path="components/workflows/:id" element={<WorkflowRecordsPage />} /> */}
          <Route
            path="components/workflows/:id"
            element={
              <PetexTipsProvider>
                <NotebookEditor />
              </PetexTipsProvider>
            }
          />
          <Route path="components/pi/:id" element={<PiRecordsPage />} />
          <Route path="scenarios" element={<Scenarios />} />
          <Route path="scenarios/:scenarioId/results" element={<ScenarioResultsPage />} />
          <Route path="scheduler" element={<Scheduler />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Fallback: anything else goes to home (or login if you prefer) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
