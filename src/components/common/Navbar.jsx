import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FaBars,
  FaBell,
  FaLocationDot,
  FaRightFromBracket,
  FaSliders,
} from "react-icons/fa6";
import { useAuth } from "../../context/AuthContext";
import QuickSettingsModal from "./QuickSettingsModal";

const TITLES = {
  "/dashboard": "Smart Energy Overview",
  "/meters": "Meters Management",
  "/alerts": "Alerts & Logs",
  "/settings": "User Profile & LINE",
};

function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("en-US", { hour12: true });
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const month = now.toLocaleDateString("en-US", { month: "short" });
  const date = `${weekday}, ${now.getDate()} ${month} ${now.getFullYear()}`;

  return (
    <div className="tb-clock">
      <div className="tb-time">{time}</div>
      <div className="tb-date">{date}</div>
    </div>
  );
}

export default function Navbar({ summary, onToggleSidebar }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);

  const { profile, openAlerts } = summary;
  const location = profile?.formatted_address || profile?.address;
  const lineLinked = profile ? Boolean(profile.line_linked) : Boolean(user.line_linked);
  const initial = [...(user.full_name || "U")][0].toUpperCase();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="tb">
      <div className="tb-left">
        <button className="tb-icon-btn tb-toggle" onClick={onToggleSidebar} aria-label="สลับเมนูด้านข้าง">
          <FaBars />
        </button>
        <div className="tb-heading">
          <div className="tb-title">{TITLES[pathname] || ""}</div>
          <div className="tb-location" title={location || ""}>
            <FaLocationDot />
            <span>{location || "ยังไม่ได้ตั้งตำแหน่ง"}</span>
          </div>
        </div>
      </div>

      <div className="tb-right">
        <Clock />

        <div className="tb-actions">
          <button
            className="tb-icon-btn tb-bell"
            onClick={() => navigate("/alerts")}
            aria-label={`การแจ้งเตือน ${openAlerts} รายการ`}
            title={openAlerts > 0 ? `${openAlerts} alert ที่ยังไม่แก้ไข` : "ไม่มี alert ค้าง"}
          >
            <FaBell />
            {openAlerts > 0 && <span className="tb-bell-dot" />}
          </button>
          <button
            className="tb-icon-btn"
            onClick={() => setShowSettings(true)}
            aria-label="ตั้งค่าระบบด่วน"
            title="Quick System Settings"
          >
            <FaSliders />
          </button>
        </div>

        <div className="tb-user">
          <span className="tb-avatar">{initial}</span>
          <div className="tb-user-text">
            <div className="tb-user-name">{user.full_name}</div>
            <div className={"tb-user-line" + (lineLinked ? " linked" : "")}>
              {lineLinked ? "LINE Linked" : "LINE Not linked"}
            </div>
          </div>
        </div>

        <button className="tb-icon-btn" onClick={handleLogout} aria-label="ออกจากระบบ" title="ออกจากระบบ">
          <FaRightFromBracket />
        </button>
      </div>

      <QuickSettingsModal show={showSettings} onHide={() => setShowSettings(false)} />
    </header>
  );
}
