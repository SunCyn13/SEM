import { useEffect, useRef } from "react";   
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import useLayoutSummary from "../../hooks/useLayoutSummary";
import { playAlertSound } from "../../utils/alertSound";
import "./Layout.css";

export default function Layout() {
  const { user } = useAuth();
  const { settings, refreshMs } = useSettings();
  const summary = useLayoutSummary(user.user_id, refreshMs);

  const prevOpen = useRef(null);
  useEffect(() => {
    if (summary.apiOnline === null) return;
    if (
      prevOpen.current !== null &&
      summary.openAlerts > prevOpen.current &&
      settings.soundAlert
    ) {playAlertSound();}
    prevOpen.current = summary.openAlerts;
  }, [summary.openAlerts, summary.apiOnline, settings.soundAlert]);

return (
    <div className="app-shell">
      <Sidebar collapsed={false} summary={summary} />
      <div className="main-area">
        <Navbar summary={summary} />
        <main className="main-content">
          <Outlet context={{ refreshSummary: summary.refresh }} />
        </main>
      </div>
    </div>
  );
}