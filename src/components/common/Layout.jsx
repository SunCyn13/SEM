import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import useLayoutSummary from "../../hooks/useLayoutSummary";
import { playAlertSound } from "../../utils/alertSound";
import "./Layout.css";

const MOBILE_BREAKPOINT = 992;
const isMobile = () => window.innerWidth < MOBILE_BREAKPOINT;

export default function Layout() {
  const { user } = useAuth();
  const { settings, refreshMs } = useSettings();
  const summary = useLayoutSummary(user.user_id, refreshMs);

  // มือถือ: เริ่มต้นซ่อนเมนู / เดสก์ท็อป: แสดงเมนู
  const [collapsed, setCollapsed] = useState(isMobile);

  // เล่นเสียงเมื่อจำนวน alert ที่ยังไม่แก้ไข "เพิ่มขึ้น" (ไม่เล่นตอนโหลดครั้งแรก)
  const prevOpen = useRef(null);
  useEffect(() => {
    if (summary.apiOnline === null) return; // ยังโหลดครั้งแรกไม่เสร็จ
    if (
      prevOpen.current !== null &&
      summary.openAlerts > prevOpen.current &&
      settings.soundAlert
    ) {
      playAlertSound();
    }
    prevOpen.current = summary.openAlerts;
  }, [summary.openAlerts, summary.apiOnline, settings.soundAlert]);

  return (
    <div className="app-shell">
      <Sidebar
        collapsed={collapsed}
        summary={summary}
        onNavigate={() => isMobile() && setCollapsed(true)}
      />
      {!collapsed && <div className="sb-backdrop" onClick={() => setCollapsed(true)} />}

      <div className="main-area">
        <Navbar summary={summary} onToggleSidebar={() => setCollapsed((c) => !c)} />
        <main className="main-content">
          <Outlet context={{ refreshSummary: summary.refresh }} />
        </main>
      </div>
    </div>
  );
}
