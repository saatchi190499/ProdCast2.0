import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button, OverlayTrigger, Tooltip } from "react-bootstrap";
import LanguageSwitcher from "../components/LanguageSwitcher";
import ModeToggle from "../components/ModeToggle";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState, useRef } from "react";
import { FaThumbtack } from "react-icons/fa";
import { useTheme } from "../context/ThemeContext";
import {
  FiLogOut,
  FiUser,
  FiMoon,
  FiSun,
  FiGlobe,
  FiHome,
  FiDatabase,
  FiBarChart2,
  FiSettings,
  FiChevronRight,
  FiChevronDown,
  FiClock
} from "react-icons/fi";
import { LuWorkflow } from "react-icons/lu";
import api from "../utils/axiosInstance";
import "./SidebarLayout.css";

export default function MainLayout() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  // ---------------- state ----------------
  const [dataSources, setDataSources] = useState([]);
  const [components, setComponents] = useState({});
  const [isPinned, setIsPinned] = useState(
    () => JSON.parse(localStorage.getItem("sidebarPinned") || "false")
  );
  const [collapsed, setCollapsed] = useState(
    () => JSON.parse(localStorage.getItem("sidebarCollapsed") || "true")
  );

  // Track open menus
  const [openMenus, setOpenMenus] = useState({
    FORECAST: false,
    SOURCE: false,
    OUTPUT: false,
  });

  // Map specific data source names to custom sidebar groups
  const NAME_TO_GROUP = useMemo(
    () => ({
      "Models": "FORECAST",
      "Events": "FORECAST",
      "PI System": "SOURCE",
      "Internal": "SOURCE",
      "Workflows": "WORKFLOW",
    }),
    []
  );

  const hoverTimer = useRef(null);
  const leaveTimer = useRef(null);

  // ---------------- derived ----------------
  const isExpanded = isPinned ? true : !collapsed;
  const shouldDock = isPinned || isExpanded;

  // ---------------- effects ----------------
  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", JSON.stringify(collapsed));
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem("sidebarPinned", JSON.stringify(isPinned));
  }, [isPinned]);

  useEffect(() => {
    api
      .get("data-sources/")
      .then((res) => setDataSources(res.data || []))
      .catch((err) => console.error(t("dataSourcesLoadError"), err));
  }, [t]);

  // auto-open submenu when navigating
  useEffect(() => {
    const path = location.pathname.toLowerCase();
    setOpenMenus({
      FORECAST: path.startsWith("/forecast") || path.startsWith("/scenarios"),
      SOURCE: path.startsWith("/source") || path.startsWith("/input"), // keep legacy
      OUTPUT: path.startsWith("/output"),
    });
  }, [location]);

  // cleanup
  useEffect(() => {
    return () => {
      clearTimeout(hoverTimer.current);
      clearTimeout(leaveTimer.current);
    };
  }, []);

  // ---------------- handlers ----------------
  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleMouseEnter = () => {
    if (isPinned) return;
    clearTimeout(leaveTimer.current);
    hoverTimer.current = setTimeout(() => setCollapsed(false), 75);
  };

  const handleMouseLeave = () => {
    if (isPinned) return;
    clearTimeout(hoverTimer.current);
    leaveTimer.current = setTimeout(() => {
      setCollapsed(true);
      setOpenMenus({ FORECAST: false, SOURCE: false, OUTPUT: false });
    }, 120);
  };

  const toggleMenu = (type) => {
    setOpenMenus((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const handleLoadComponents = async (ds) => {
    if (components[ds.data_source_name]) return; // already loaded
    try {
      const res = await api.get(
        `data-sources/${ds.data_source_name}/components/`
      );
      setComponents((prev) => ({
        ...prev,
        [ds.data_source_name]: res.data,
      }));
    } catch (err) {
      console.error("Failed to load components", err);
    }
  };

  const componentRouteFor = (dsName, compId) => {
    if (dsName === "Events") return `/components/events/${compId}`;
    if (dsName === "Workflows") return `/components/workflows/${compId}`;
    if (dsName === "PI System") return `/components/pi/${compId}`;
    // Fallback: open the data source page
    return `/input/${dsName}`;
  };

  // ---------------- render ----------------
  return (
    <div
      className={`app-shell ${isExpanded ? "expanded" : "collapsed"} ${isPinned ? "pinned pinned-skip-scrim" : ""
        } ${shouldDock ? "docked" : ""}`}
    >
      {/* Sidebar */}
      <aside
        className="app-sidebar"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="sidebar-top">
          <div className="brand">
            <img
              src="/image.png"
              alt="ProdApp logo"
              className="brand-emoji"
              style={{ width: "40px", height: "40px" }}
            />
            {isExpanded && <span className="brand-text">ProdApp</span>}
          </div>

          {/* Pin button */}
          {isExpanded && (
            <button
              type="button"
              className={`pin-btn ${isPinned ? "pinned" : ""}`}
              onClick={() => {
                setIsPinned((v) => {
                  const next = !v;
                  if (next) setCollapsed(false);
                  return next;
                });
              }}
            >
              <FaThumbtack
                style={{
                  transform: isPinned ? "rotate(45deg)" : "rotate(0deg)",
                  transition: "transform 120ms ease",
                }}
              />
            </button>
          )}
        </div>

        <nav className="sidebar-nav">
          {/* Home */}
          <SidebarLink
            to="/"
            icon={<FiHome />}
            label={t("home")}
            collapsed={collapsed}
          />

          {/* Forecast group */}
          {(() => {
            const groupSources = dataSources.filter(
              (ds) => NAME_TO_GROUP[ds.data_source_name] === "FORECAST"
            );
            if (groupSources.length === 0) return null;
            const type = "FORECAST";
            const isOpen = openMenus[type];
            const label = t("forecast") || "Forecast";
            const icon = <FiBarChart2 />;
            return (
              <div key={type}>
                <div
                  className="sidebar-link"
                  role="button"
                  onClick={() => toggleMenu(type)}
                >
                  <div className="link-inner">
                    <span className="icon">{icon}</span>
                    {!collapsed && (
                      <>
                        <span className="label">{label}</span>
                        <span className="ms-auto caret">
                          {isOpen ? <FiChevronDown /> : <FiChevronRight />}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {!collapsed && isOpen && (
                  <div className="inputs-dd">
                    {/* Scenarios entry inside Forecast */}
                    <NavLink
                      to="/scenarios"
                      className={({ isActive }) =>
                        `inputs-dd-item ${isActive ? "active" : ""}`
                      }
                    >
                      {t("scenarios")}
                    </NavLink>

                    {groupSources.map((ds) => (
                      <div key={ds.id}>
                        <NavLink
                          to={`/forecast/${ds.data_source_name}`}
                          className={({ isActive }) =>
                            `inputs-dd-item ${isActive ? "active" : ""}`
                          }
                          onClick={() => handleLoadComponents(ds)}
                        >
                          {ds.data_source_name}
                        </NavLink>

                        {components[ds.data_source_name] &&
                          components[ds.data_source_name].map((comp) => (
                            <NavLink
                              key={comp.id}
                              to={componentRouteFor(ds.data_source_name, comp.id)}
                              className="inputs-dd-subitem"
                            />
                          ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Data Source group (formerly Inputs) */}
          {(() => {
            const type = "SOURCE";
            const groupSources = dataSources.filter(
              (ds) => NAME_TO_GROUP[ds.data_source_name] === type
            );
            if (groupSources.length === 0) return null;
            const isOpen = openMenus[type];
            const label = t("source"); // translation updated to "Data Source"
            const icon = <FiDatabase />;
            return (
              <div key={type}>
                <div
                  className="sidebar-link"
                  role="button"
                  onClick={() => toggleMenu(type)}
                >
                  <div className="link-inner">
                    <span className="icon">{icon}</span>
                    {!collapsed && (
                      <>
                        <span className="label">{label}</span>
                        <span className="ms-auto caret">
                          {isOpen ? <FiChevronDown /> : <FiChevronRight />}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {!collapsed && isOpen && (
                  <div className="inputs-dd">
                    {groupSources.map((ds) => (
                      <div key={ds.id}>
                        <NavLink
                          to={`/source/${ds.data_source_name}`}
                          className={({ isActive }) =>
                            `inputs-dd-item ${isActive ? "active" : ""}`
                          }
                          onClick={() => handleLoadComponents(ds)}
                        >
                          {ds.data_source_name}
                        </NavLink>

                        {components[ds.data_source_name] &&
                          components[ds.data_source_name].map((comp) => (
                            <NavLink
                              key={comp.id}
                              to={componentRouteFor(ds.data_source_name, comp.id)}
                              className="inputs-dd-subitem"
                            />
                          ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}


          <SidebarLink
            to="/workflow/Workflows"
            icon={<LuWorkflow />}
            label={t("workflow")}
            collapsed={collapsed}
          />
          <SidebarLink
            to="/scheduler"
            icon={<FiClock />}
            label={t("scheduler")}
            collapsed={collapsed}
          />

          {/* Results (OUTPUT group) */}
          {["OUTPUT"].map((type) => {
            const groupSources = dataSources.filter(
              (ds) => ds.data_source_type === type
            );
            if (groupSources.length === 0) return null;

            const isOpen = openMenus[type];
            const label = t("results");
            const icon = <FiBarChart2 />;

            return (
              <div key={type}>
                <div
                  className="sidebar-link"
                  role="button"
                  onClick={() => toggleMenu(type)}
                >
                  <div className="link-inner">
                    <span className="icon">{icon}</span>
                    {!collapsed && (
                      <>
                        <span className="label">{label}</span>
                        <span className="ms-auto caret">
                          {isOpen ? <FiChevronDown /> : <FiChevronRight />}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {!collapsed && isOpen && (
                  <div className="inputs-dd">
                    {groupSources.map((ds) => (
                      <div key={ds.id}>
                        <NavLink
                          to={`/output/${ds.data_source_name}`}
                          className={({ isActive }) =>
                            `inputs-dd-item ${isActive ? "active" : ""}`
                          }
                          onClick={() => handleLoadComponents(ds)}
                        >
                          {ds.data_source_name}
                        </NavLink>

                        {components[ds.data_source_name] &&
                          components[ds.data_source_name].map((comp) => (
                            <NavLink
                              key={comp.id}
                              to={`/output/${ds.data_source_name}/${comp.name}`}
                              className="inputs-dd-subitem"
                            />
                          ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}


        </nav>

        {/* Footer */}
        <div className="sidebar-bottom">
          <FooterActions
            isExpanded={isExpanded}
            onLogout={handleLogout}
            userName={user?.first_name || user?.username}
            t={t}   // 👈 pass translation function
          />
        </div>
      </aside>

      {/* Content */}
      <main className="app-content">
        <div className="content-inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/* ---------- helpers ---------- */

function SidebarLink({ to, icon, label, collapsed }) {
  const linkEl = (
    <div className="link-inner">
      <span className="icon">{icon}</span>
      {!collapsed && <span className="label">{label}</span>}
    </div>
  );
  if (collapsed) {
    return (
      <OverlayTrigger placement="right" overlay={<Tooltip>{label}</Tooltip>}>
        <NavLink to={to} className="sidebar-link">
          {linkEl}
        </NavLink>
      </OverlayTrigger>
    );
  }
  return (
    <NavLink to={to} className="sidebar-link">
      {linkEl}
    </NavLink>
  );
}

function FooterActions({ isExpanded, onLogout, userName, t }) {
  const themeBtnRef = useRef(null);
  const langBtnRef = useRef(null);
  const { mode } = useTheme();

  if (isExpanded) {
    return (
      <div className="footer-actions">
        <div className="fa-row-btn is-info">
          <span className="fa-left">
            <span className="fa-ico">
              <FiUser />
            </span>
            <span className="fa-label">{userName || "User"}</span>
          </span>
        </div>

        <div
          className="fa-row-btn is-control"
          onClick={() => themeBtnRef.current?.click()}
        >
          <span className="fa-left">
            <span className="fa-ico">
              {mode === "light" ? <FiSun /> : <FiMoon />}
            </span>
            <span className="fa-label">Mode</span>
          </span>
          <span className="fa-right">
            <ModeToggle ref={themeBtnRef} showIcon={false} />
          </span>
        </div>

        <div
          className="fa-row-btn is-control"
          onClick={() => langBtnRef.current?.click()}
        >
          <span className="fa-left">
            <span className="fa-ico">
              <FiGlobe />
            </span>
            <span className="fa-label">Language</span>
          </span>
          <span className="fa-right">
            <LanguageSwitcher ref={langBtnRef} showIcon={false} />
          </span>
        </div>
        {/* Settings row */}
        <NavLink to="/settings" className="fa-row-btn is-control">
          <span className="fa-left">
            <span className="fa-ico">
              <FiSettings />
            </span>
            <span className="fa-label">{t("settings")}</span>
          </span>
        </NavLink>
        {/* Logout row */}
        <Button
          variant="outline-danger"
          className="fa-row-btn w-100"
          onClick={onLogout}
        >
          <span className="fa-left">
            <span className="fa-ico">
              <FiLogOut />
            </span>
            <span className="fa-label">Logout</span>
          </span>
        </Button>
      </div>
    );
  }

  return (
    <div className="footer-actions">
      <OverlayTrigger
        placement="right"
        overlay={<Tooltip id="tt-user">{userName || "User"}</Tooltip>}
      >
        <div className="action-compact is-info">
          <FiUser />
        </div>
      </OverlayTrigger>

      <OverlayTrigger
        placement="right"
        overlay={<Tooltip id="tt-theme">Theme</Tooltip>}
      >
        <div className="action-compact is-control">
          <ModeToggle />
        </div>
      </OverlayTrigger>

      <OverlayTrigger
        placement="right"
        overlay={<Tooltip id="tt-lang">Language</Tooltip>}
      >
        <div className="action-compact is-control">
          <LanguageSwitcher />
        </div>
      </OverlayTrigger>

      <OverlayTrigger
        placement="right"
        overlay={<Tooltip id="tt-settings">{t("settings")}</Tooltip>}
      >
        <NavLink to="/settings" className="action-compact is-control">
          <FiSettings />
        </NavLink>
      </OverlayTrigger>

      <OverlayTrigger
        placement="right"
        overlay={<Tooltip id="tt-logout">Logout</Tooltip>}
      >
        <div className="action-compact is-action" onClick={onLogout}>
          <FiLogOut />
        </div>
      </OverlayTrigger>

    </div>
  );
}

