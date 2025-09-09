import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button, OverlayTrigger, Tooltip } from "react-bootstrap";
import LanguageSwitcher from "../components/LanguageSwitcher";
import ModeToggle from "../components/ModeToggle";
import ThemeSelect from "../components/ThemeSelect";
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
  FiLayers,
  FiBarChart2,
  FiSettings,
  FiChevronRight,
  FiChevronDown,
} from "react-icons/fi";
import api from "../utils/axiosInstance";
import "./SidebarLayout.css";

export default function MainLayout() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  // ---------------- state & refs ----------------
  const [submenuOpen, setSubmenuOpen] = useState(false); // Inputs dropdown open
  const [dataSources, setDataSources] = useState([]);
  const [isPinned, setIsPinned] = useState(
    () => JSON.parse(localStorage.getItem("sidebarPinned") || "false")
  );

  const [collapsed, setCollapsed] = useState(() =>
    JSON.parse(localStorage.getItem("sidebarCollapsed") || "true")
  );

  const hoverTimer = useRef(null);
  const leaveTimer = useRef(null);

  // ---------------- derived values ----------------
  const isInputsRoute = location.pathname.toLowerCase().startsWith("/inputs");
  const isExpanded = isPinned ? true : !collapsed;
  // Dock the sidebar on ALL pages whenever expanded (or pinned)
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

  // Keep Inputs dropdown open when we are on /inputs/*
  useEffect(() => {
    setSubmenuOpen(isInputsRoute);
  }, [isInputsRoute]);

  // ESC unpins
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && isPinned) setIsPinned(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPinned]);

  // Clear timers on unmount
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
      setSubmenuOpen(false);
    }, 120);
  };

  const navItems = useMemo(
    () => [
      { to: "/", label: t("home"), icon: <FiHome /> },
      { to: "/scenarios", label: t("scenarios"), icon: <FiLayers /> },
      { to: "/results", label: t("results"), icon: <FiBarChart2 /> },
      { to: "/settings", label: t("settings"), icon: <FiSettings /> },
    ],
    [t]
  );

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

          {/* Pin button visible only when expanded */}
          {isExpanded && (
            <button
              type="button"
              className={`pin-btn ${isPinned ? "pinned" : ""}`}
              onClick={() => {
                setIsPinned((v) => {
                  const next = !v;
                  if (next) setCollapsed(false); // keep open when pinning
                  return next;
                });
              }}
              aria-pressed={isPinned}
              aria-label={isPinned ? t("unpin") : t("pin")}
              title={isPinned ? t("unpin") : t("pin")}
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

          {/* Inputs clickable row */}
          <div
            className={`sidebar-link ${isInputsRoute ? "active" : ""}`}
            role="button"
            tabIndex={0}
            aria-expanded={submenuOpen}
            aria-controls="inputs-dd"
            onClick={() => {
              if (collapsed) setCollapsed(false); // expand if collapsed
              setSubmenuOpen((v) => !v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (collapsed) setCollapsed(false);
                setSubmenuOpen((v) => !v);
              }
            }}
          >
            <div className="link-inner">
              <span className="icon">
                <FiDatabase />
              </span>
              {!collapsed && (
                <>
                  <span className="label">{t("inputs")}</span>
                  <span className="ms-auto caret">
                    {submenuOpen ? <FiChevronDown /> : <FiChevronRight />}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Inputs dropdown (expanded + open) */}
          {!collapsed && submenuOpen && (
            <div id="inputs-dd" className="inputs-dd">
              {dataSources.map((ds) => {
                const to = `/inputs/${ds.data_source_name}`;
                const active =
                  location.pathname.toLowerCase() === to.toLowerCase();
                return (
                  <NavLink
                    key={ds.id ?? ds.data_source_name}
                    to={to}
                    className={({ isActive }) =>
                      `inputs-dd-item ${isActive || active ? "active" : ""}`
                    }
                    onClick={() => setSubmenuOpen(true)} // keep open under /inputs
                  >
                    {ds.data_source_name}
                  </NavLink>
                );
              })}
            </div>
          )}

          {/* Remaining nav items */}
          {navItems.slice(1).map((item) => (
            <SidebarLink
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              collapsed={collapsed}
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-bottom">
          <FooterActions
            isExpanded={isExpanded}
            onLogout={handleLogout}
            userName={user?.first_name || user?.username}
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
        <NavLink
          to={to}
          className={({ isActive }) =>
            `sidebar-link ${isActive ? "active" : ""}`
          }
        >
          {linkEl}
        </NavLink>
      </OverlayTrigger>
    );
  }
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
    >
      {linkEl}
    </NavLink>
  );
}

/* ---------- FooterActions ---------- */

function FooterActions({ isExpanded, onLogout, userName }) {
  const themeBtnRef = useRef(null);
  const langBtnRef = useRef(null);

  const { mode } = useTheme();

  if (isExpanded) {
    return (
      <div className="footer-actions">
        {/* User row */}
        <div className="fa-row-btn is-info">
          <span className="fa-left">
            <span className="fa-ico">
              <FiUser />
            </span>
            <span className="fa-label">{userName || "User"}</span>
          </span>
        </div>

        {/* Mode row */}
        <div className="fa-row-btn is-control" onClick={() => themeBtnRef.current?.click()}>
          <span className="fa-left">
            <span className="fa-ico">{mode === "light" ? <FiSun /> : <FiMoon />}</span>
            <span className="fa-label">Mode</span>
          </span>
          <span className="fa-right">
            <ModeToggle ref={themeBtnRef} showIcon={false} />
          </span>
        </div>

        {/* Language row */}
        <div
          className="fa-row-btn is-control"
          onClick={() => langBtnRef.current?.click()}
        >
          <span className="fa-left">
            <span className="fa-ico" >
              <FiGlobe />
            </span>
            <span className="fa-label">Language</span>
          </span>
          <span className="fa-right">
            {/* LanguageSwitcher should accept forwardRef + showIcon */}
            <LanguageSwitcher ref={langBtnRef} showIcon={false} />
          </span>
        </div>

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

  // Collapsed: compact squares (use real controls)
  return (
    <div className="footer-actions">
      <OverlayTrigger
        placement="right"
        overlay={<Tooltip>{userName || "User"}</Tooltip>}
      >
        <div className="action-compact is-info">
          <FiUser />
        </div>
      </OverlayTrigger>

      <OverlayTrigger placement="right" overlay={<Tooltip>Theme</Tooltip>}>
        <div className="action-compact is-control">
          <ModeToggle />
        </div>
      </OverlayTrigger>

      <OverlayTrigger placement="right" overlay={<Tooltip>Language</Tooltip>}>
        <div className="action-compact is-control">
          <LanguageSwitcher />
        </div>
      </OverlayTrigger>

      <OverlayTrigger placement="right" overlay={<Tooltip>Logout</Tooltip>}>
        <div className="action-compact is-action" onClick={onLogout}>
          <FiLogOut />
        </div>
      </OverlayTrigger>
    </div>
  );
}