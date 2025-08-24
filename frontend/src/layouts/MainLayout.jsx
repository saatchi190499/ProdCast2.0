import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Navbar, Nav, Container, Button } from "react-bootstrap";
import LanguageSwitcher from "../components/LanguageSwitcher";
import ThemeSwitcher from "../components/ThemeSwitcher";
import { useTranslation } from "react-i18next";
import { useRef, useState } from "react";
import { CSSTransition } from "react-transition-group";
import "./InputsTransition.css"; // создадим ниже
import { FiLogOut } from "react-icons/fi";

import { useEffect } from "react";
import api from "../utils/axiosInstance";

export default function MainLayout() {
  const { user, role, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const [showSubButtons, setShowSubButtons] = useState(false);
  const inputsAnimRef = useRef(null);
  const inputsDropdownRef = useRef(null);
  const [dataSources, setDataSources] = useState([]);
  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    api.get("data-sources/")
      .then((res) => setDataSources(res.data))
      .catch((err) => console.error(t("dataSourcesLoadError"), err));
  }, []);

  return (
    <>
      <Navbar bg="body" expand="lg" className="shadow-sm" data-bs-theme="auto">
        <Container fluid>
          <Navbar.Brand as={Link} to="/">🛠 ProdApp</Navbar.Brand>
          <Navbar.Toggle />
          <Navbar.Collapse className="justify-content-between">
            <Nav className="me-auto align-items-center gap-0">

              <Nav.Link
                as={Link}
                to="/"
                className={`nav-link-custom ${currentPath === "/" ? "nav-link-active fw-bold text-primary" : ""
                  }`}
              >
                {t("home")}
              </Nav.Link>

              <Nav.Link
                ref={inputsAnimRef}
                onClick={() => setShowSubButtons(!showSubButtons)}
                className={`nav-link-custom  ${currentPath.startsWith("/inputs") ? "nav-link-active fw-bold text-primary" : ""}`}
                style={{ outline: "none", boxShadow: "none" }}
              >
                {t("inputs")}
                <span>{showSubButtons ? " ▷" : ""}</span>
              </Nav.Link>

              <CSSTransition
                in={showSubButtons}
                timeout={200}
                classNames="fade-right"
                unmountOnExit
                nodeRef={inputsDropdownRef} // 👈 обязательно
              >
                <div
                  ref={inputsDropdownRef}
                  className="d-flex align-items-center gap-0"
                >
                  {dataSources.map((ds) => {
                    const isActive =
                      currentPath.toLowerCase() === `/inputs/${ds.data_source_name.toLowerCase()}`;

                    return (
                      <Button
                        key={ds.id}
                        variant={isActive ? "primary" : ""}
                        size="sm"
                        onClick={() => navigate(`/inputs/${ds.data_source_name}`)}
                        className={isActive ? "fw-bold" : ""}
                      >
                        {ds.data_source_name}
                      </Button>
                    );
                  })}
                </div>
              </CSSTransition>

              <Nav.Link
                as={Link}
                to="/scenarios"
                className={`nav-link-custom ${currentPath.startsWith("/scenarios") ? "nav-link-active fw-bold text-primary" : ""}`}
              >
                {t("scenarios")}
              </Nav.Link>

              <Nav.Link
                as={Link}
                to="/results"
                className={`nav-link-custom ${currentPath.startsWith("/results") ? "nav-link-active fw-bold text-primary" : ""}`}
              >
                {t("results")}
              </Nav.Link>

              <Nav.Link
                as={Link}
                to="/settings"
                className={`nav-link-custom ${currentPath.startsWith("/settings") ? "nav-link-active fw-bold text-primary" : ""
                  }`}
              >
                {t("settings")}
              </Nav.Link>

            </Nav>

            {/* Справа: тема, язык, юзер */}
            <div className="d-flex align-items-center gap-2">
              {user && (
                <>
                  <span className="me-2"> {user.first_name || user.username} 👤</span>
                  <span
                    onClick={handleLogout}
                    title={t("logout")}
                    style={{
                      cursor: "pointer",
                      color: "inherit"
                    }}
                  >
                    <FiLogOut size={20} />
                  </span>
                </>
              )}
              <ThemeSwitcher />
              <LanguageSwitcher />

            </div>
          </Navbar.Collapse>
        </Container>
      </Navbar>


      <Container fluid className="py-4">
        <Outlet />
      </Container>


    </>
  );
}
