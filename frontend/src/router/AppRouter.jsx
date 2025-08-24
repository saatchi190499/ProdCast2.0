import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import Settings from "../pages/Settings";
import ModelsPage from "../pages/models/ModelsPage";
import EventRecordsPage from "../pages/events/EventRecordsPage";
import DataSourcePage from "../pages/DataSourcePage";
import Scenarios from "../pages/scenario/Scenarios";
import Results from "../pages/results/Results";
import { isAuthenticated } from "../utils/auth";
import MainLayout from "../layouts/MainLayout";

function PrivateRoute({ children }) {
    return isAuthenticated() ? children : <Navigate to="/login" />;
}

export default function AppRouter() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                    path="/"
                    element={
                        <PrivateRoute>
                            <MainLayout />
                        </PrivateRoute>
                    }
                >
                    <Route index element={<Dashboard />} />
                    <Route
                        path="/inputs/:sourceName"
                        element={
                            <PrivateRoute>
                                    <DataSourcePage />
                            </PrivateRoute>
                        }
                    />

                    <Route path="/components/:id/events" element={<EventRecordsPage />} />

                    <Route path="/scenarios"
                        element={
                            <PrivateRoute>
                                <Scenarios />
                            </PrivateRoute>
                        }
                    />

                    <Route path="/results"
                        element={
                            <PrivateRoute>
                                <Results />
                            </PrivateRoute>
                        }
                    />

                    <Route path="settings"
                        element={
                            <Settings />
                        }
                    />

                </Route>
            </Routes>
        </BrowserRouter>
    );
}
