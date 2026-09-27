import { NavLink } from "react-router-dom";
import {
  FaBolt,
  FaBurst,
  FaChartLine,
  FaGaugeHigh,
  FaTriangleExclamation,
  FaUserGear,
} from "react-icons/fa6";
import axiosInstance from "../../api/axiosInstance";

const LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: <FaChartLine /> },
  { to: "/meters", label: "Meters Management", icon: <FaGaugeHigh />, badge: "meterCount" },
  { to: "/alerts", label: "Alerts & Logs", icon: <FaTriangleExclamation />, badge: "openAlerts", warn: true },
  { to: "/settings", label: "User Profile & LINE", icon: <FaUserGear /> },
];

export default function Sidebar({ collapsed, summary, onNavigate }) {
  const { meterCount, openAlerts, apiOnline } = summary;
  const counts = { meterCount, openAlerts };

  const apiHost = (axiosInstance.defaults.baseURL || "").replace(/^https?:\/\//, "");
  const statusTone = apiOnline === null ? "wait" : apiOnline ? "on" : "off";
  const statusLabel =
    apiOnline === null ? "Checking..." : apiOnline ? "Backend Online" : "Backend Offline";

  return (
    <aside className={"sb" + (collapsed ? " sb-collapsed" : "")}>
      <div className="sb-brand">
        <span className="sb-logo"><FaBolt /></span>
        <div>
          <div className="sb-title">SEM</div>
          <div className="sb-sub">Smart Energy Monitoring</div>
        </div>
      </div>

      <nav className="sb-nav">
        {LINKS.map((l) => {
          const n = l.badge ? counts[l.badge] : 0;
          return (
            <NavLink
              key={l.to}
              to={l.to}
              onClick={onNavigate}
              className={({ isActive }) => "sb-link" + (isActive ? " active" : "")}
            >
              <span className="sb-icon">{l.icon}</span>
              <span className="sb-label">{l.label}</span>
              {n > 0 && (
                <span className={"sb-badge" + (l.warn ? " sb-badge-warn" : "")}>{n}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="sb-status">
        <span className={`sb-dot sb-dot-${statusTone}`} />
        <div className="sb-status-text">
          <div className="sb-status-title">{statusLabel}</div>
          <div className="sb-status-sub">FastAPI · {apiHost}</div>
        </div>
      </div>
    </aside>
  );
}
