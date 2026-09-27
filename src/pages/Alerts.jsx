import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Form, Spinner } from "react-bootstrap";
import { FaCheck } from "react-icons/fa6";
import api from "../api/axiosInstance";
import { getAlertsByUser, resolveAlert } from "../api/alertApi";
import { useAuth } from "../context/AuthContext";
import StatCard from "../components/common/StatCard";
import { ALERT_TYPE_LABEL, SEVERITY_LABEL } from "../utils/constants";
import { formatDateTime } from "../utils/formatters";
import "./Alerts.css";

const FILTERS = [
  { key: "open", label: "ยังไม่แก้ไข" },
  { key: "resolved", label: "แก้ไขแล้ว" },
  { key: "all", label: "ทั้งหมด" },
];

export default function Alerts() {
  const { user, isAdmin } = useAuth();
  // user ธรรมดา: ดูของตัวเองเสมอ / admin: เลือกดู user_id อื่นได้ (เหมือนหน้า Meters)
  const [targetUserId, setTargetUserId] = useState(String(user.user_id));
  const activeUserId = isAdmin ? Number(targetUserId) : user.user_id;

  const [alerts, setAlerts] = useState([]);
  const [meterMap, setMeterMap] = useState({}); // { meter_id: meter_serial }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("open");
  const [resolvingId, setResolvingId] = useState(null);

  const load = useCallback(async () => {
    if (!activeUserId) {
      setAlerts([]);
      setMeterMap({});
      setLoading(false);
      return;
    }
    try {
      setError("");
      setLoading(true);
      const [aRes, mRes] = await Promise.all([
        getAlertsByUser(activeUserId),
        api.get(`/meters/${activeUserId}`),
      ]);
      setAlerts(aRes.data);
      const map = {};
      for (const m of mRes.data) map[m.meter_id] = m.meter_serial;
      setMeterMap(map);
    } catch (e) {
      setError(e.userMessage || "โหลดการแจ้งเตือนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [activeUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolve = async (alertId) => {
    setResolvingId(alertId);
    try {
      const { data } = await resolveAlert(alertId);
      setAlerts((prev) => prev.map((a) => (a.alert_id === alertId ? data : a)));
    } catch (e) {
      setError(e.userMessage || "อัปเดตสถานะไม่สำเร็จ");
    } finally {
      setResolvingId(null);
    }
  };

  // นับเฉพาะที่ยังไม่แก้ไข แยกตามความรุนแรง
  const counts = useMemo(() => {
    const c = { open: 0, high: 0, medium: 0, low: 0 };
    for (const a of alerts) {
      if (a.is_resolved) continue;
      c.open += 1;
      if (c[a.severity] !== undefined) c[a.severity] += 1;
    }
    return c;
  }, [alerts]);

  const visible = alerts.filter((a) => {
    if (filter === "open") return !a.is_resolved;
    if (filter === "resolved") return a.is_resolved;
    return true;
  });

  return (
    <div className="al-page">
      <div className="al-header">
        <div>
          <h3>Alerts</h3>
          <p>การแจ้งเตือนความผิดปกติและการใช้ไฟเกินงบของมิเตอร์</p>
        </div>
        {isAdmin && (
          <Form.Control
            type="number"
            min="1"
            size="sm"
            style={{ width: 130 }}
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            title="user_id ของเจ้าของมิเตอร์"
            placeholder="user_id"
          />
        )}
      </div>

      <div className="stat-grid">
        <StatCard label="ยังไม่แก้ไข" value={counts.open} unit="รายการ" />
        <StatCard label="ความรุนแรงสูง" value={counts.high} unit="รายการ" />
        <StatCard label="ความรุนแรงปานกลาง" value={counts.medium} unit="รายการ" />
        <StatCard label="ความรุนแรงต่ำ" value={counts.low} unit="รายการ" />
      </div>

      <div className="al-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={"al-filter" + (filter === f.key ? " active" : "")}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="al-card">
        <table className="al-table">
          <thead>
            <tr>
              <th>เวลา</th>
              <th>มิเตอร์</th>
              <th>ประเภท</th>
              <th>ความรุนแรง</th>
              <th>รายละเอียด</th>
              <th>สถานะ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="al-empty"><Spinner size="sm" /></td></tr>
            )}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={7} className="al-empty">ไม่มีการแจ้งเตือน</td></tr>
            )}
            {!loading &&
              visible.map((a) => (
                <tr key={a.alert_id} className={a.is_resolved ? "al-done" : ""}>
                  <td className="al-time">{formatDateTime(a.created_at)}</td>
                  <td className="al-serial">{meterMap[a.meter_id] || `#${a.meter_id}`}</td>
                  <td>{ALERT_TYPE_LABEL[a.alert_type] || a.alert_type}</td>
                  <td>
                    <span className={`al-pill al-pill-${a.severity}`}>
                      <i /> {SEVERITY_LABEL[a.severity] || a.severity}
                    </span>
                  </td>
                  <td>{a.message}</td>
                  <td>
                    <span className={`al-pill ${a.is_resolved ? "al-pill-done" : "al-pill-medium"}`}>
                      <i /> {a.is_resolved ? "แก้ไขแล้ว" : "รอดำเนินการ"}
                    </span>
                  </td>
                  <td className="text-end">
                    {!a.is_resolved && (
                      <button
                        className="al-resolve"
                        disabled={resolvingId === a.alert_id}
                        onClick={() => handleResolve(a.alert_id)}
                      >
                        <FaCheck /> แก้ไขแล้ว
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}