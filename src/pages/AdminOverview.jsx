import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Spinner } from "react-bootstrap";
import { GoogleMap, InfoWindow, Marker, useJsApiLoader } from "@react-google-maps/api";
import { getAdminOverview } from "../api/adminApi";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import StatCard from "../components/common/StatCard";
import "./Alerts.css"; // ใช้ .al-card / .al-table / .al-pill ร่วมกัน
import "./AdminOverview.css";

const MAP_STYLE = { width: "100%", height: "100%" };
const DEFAULT_CENTER = { lat: 13.7563, lng: 100.5018 };
const COLOR_OK = "#34d399";
const COLOR_ALERT = "#f87171";

const DARK_MAP = [
  { elementType: "geometry", stylers: [{ color: "#0f1b30" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8b96b1" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b1120" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2a44" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#07101f" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
];

const num = (n, d = 2) =>
  Number(n).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function AdminOverview() {
  const { user } = useAuth();
  const { refreshMs } = useSettings();

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
  });

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const mapRef = useRef(null);
  const fittedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const { data } = await getAdminOverview(user.user_id);
      setData(data);
      setError("");
    } catch (e) {
      setError(e.userMessage || "โหลดภาพรวมระบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [user.user_id]);

  useEffect(() => {
    load();
    const id = setInterval(load, Math.max(refreshMs, 10000));
    return () => clearInterval(id);
  }, [load, refreshMs]);

  const users = data?.users || [];
  const withCoords = useMemo(
    () => users.filter((u) => u.latitude != null && u.longitude != null),
    [users]
  );
  const selected = users.find((u) => u.user_id === selectedId) || null;

  // ซูมให้เห็นหมุดทั้งหมด "ครั้งแรกครั้งเดียว" (รีเฟรชข้อมูลแล้วไม่ดึงแผนที่กลับ)
  const fit = useCallback(() => {
    const map = mapRef.current;
    if (!map || fittedRef.current || withCoords.length === 0) return;
    fittedRef.current = true;
    if (withCoords.length === 1) {
      map.setCenter({ lat: withCoords[0].latitude, lng: withCoords[0].longitude });
      map.setZoom(12);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    withCoords.forEach((u) => bounds.extend({ lat: u.latitude, lng: u.longitude }));
    map.fitBounds(bounds, 48);
  }, [withCoords]);

  useEffect(() => {
    fit();
  }, [fit]);

  const focusUser = (u) => {
    setSelectedId(u.user_id);
    if (u.latitude != null && mapRef.current) {
      mapRef.current.panTo({ lat: u.latitude, lng: u.longitude });
      mapRef.current.setZoom(14);
    }
  };

  const totals = data?.totals;

  return (
    <div className="al-page">
      <div className="al-header">
        <div>
          <h3>Admin Overview</h3>
          <p>ภาพรวมการใช้ไฟฟ้าของผู้ใช้ทุกราย หมุดแดงคือผู้ใช้ที่มีการแจ้งเตือนค้างอยู่</p>
        </div>
      </div>

      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}

      <div className="stat-grid">
        <StatCard label="ผู้ใช้ทั้งหมด" value={totals ? totals.users : "-"} unit="ราย" />
        <StatCard label="มิเตอร์ทั้งหมด" value={totals ? totals.meters : "-"} unit="เครื่อง" />
        <StatCard label="แจ้งเตือนค้าง" value={totals ? totals.open_alerts : "-"} unit="รายการ" />
        <StatCard
          label="ค่าไฟรวมเดือนนี้"
          value={totals ? num(totals.month_cost) : "-"}
          unit="บาท"
          hint={totals ? `${num(totals.month_kwh)} kWh` : undefined}
        />
      </div>

      <div className="ad-map">
        {loadError && <div className="ad-map-msg text-danger">โหลดแผนที่ไม่สำเร็จ (เช็ก VITE_GOOGLE_MAPS_API_KEY)</div>}
        {!loadError && !isLoaded && <div className="ad-map-msg"><Spinner size="sm" /></div>}
        {isLoaded && (
          <GoogleMap
            mapContainerStyle={MAP_STYLE}
            center={DEFAULT_CENTER}
            zoom={6}
            options={{ styles: DARK_MAP, streetViewControl: false, mapTypeControl: false }}
            onLoad={(map) => {
              mapRef.current = map;
              fit();
            }}
            onClick={() => setSelectedId(null)}
          >
            {withCoords.map((u) => (
              <Marker
                key={u.user_id}
                position={{ lat: u.latitude, lng: u.longitude }}
                onClick={() => setSelectedId(u.user_id)}
                icon={{
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: u.user_id === selectedId ? 11 : 8,
                  fillColor: u.open_alerts > 0 ? COLOR_ALERT : COLOR_OK,
                  fillOpacity: 1,
                  strokeColor: "#ffffff",
                  strokeWeight: 2,
                }}
              />
            ))}
            {selected && selected.latitude != null && (
              <InfoWindow
                position={{ lat: selected.latitude, lng: selected.longitude }}
                onCloseClick={() => setSelectedId(null)}
              >
                <div style={{ color: "#111", minWidth: 180, fontSize: 13 }}>
                  <strong>{selected.full_name}</strong>
                  <div>{selected.formatted_address || "-"}</div>
                  <div>มิเตอร์ {selected.meter_count} เครื่อง</div>
                  <div>ค่าไฟเดือนนี้ {num(selected.month_cost)} บาท</div>
                  <div>แจ้งเตือนค้าง {selected.open_alerts} รายการ</div>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
      </div>

      <h5 className="ad-section">สรุปตามจังหวัด</h5>
      <div className="al-card">
        <table className="al-table">
          <thead>
            <tr>
              <th>จังหวัด</th>
              <th className="text-end">ผู้ใช้</th>
              <th className="text-end">kWh เดือนนี้</th>
              <th className="text-end">ค่าไฟเดือนนี้ (บาท)</th>
              <th className="text-end">แจ้งเตือนค้าง</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="al-empty"><Spinner size="sm" /></td></tr>}
            {!loading && (data?.provinces || []).length === 0 && (
              <tr><td colSpan={5} className="al-empty">ยังไม่มีข้อมูล</td></tr>
            )}
            {(data?.provinces || []).map((p) => (
              <tr key={p.province}>
                <td>{p.province}</td>
                <td className="text-end">{p.users}</td>
                <td className="text-end al-time">{num(p.month_kwh)}</td>
                <td className="text-end al-time">{num(p.month_cost)}</td>
                <td className="text-end">
                  <span className={`al-pill ${p.open_alerts > 0 ? "al-pill-high" : "al-pill-low"}`}>
                    <i /> {p.open_alerts}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h5 className="ad-section">ผู้ใช้ทั้งหมด</h5>
      <div className="al-card">
        <table className="al-table">
          <thead>
            <tr>
              <th>ผู้ใช้</th>
              <th>ที่อยู่</th>
              <th className="text-end">มิเตอร์</th>
              <th className="text-end">kWh เดือนนี้</th>
              <th className="text-end">ค่าไฟ / งบ</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {!loading && users.length === 0 && (
              <tr><td colSpan={6} className="al-empty">ยังไม่มีผู้ใช้</td></tr>
            )}
            {users.map((u) => {
              const pct = u.monthly_budget ? (u.month_cost / u.monthly_budget) * 100 : null;
              return (
                <tr
                  key={u.user_id}
                  className={"ad-row" + (u.user_id === selectedId ? " ad-row-active" : "")}
                  onClick={() => focusUser(u)}
                >
                  <td>
                    <div className="al-serial">{u.full_name}</div>
                    <div className="ad-sub">#{u.user_id} · {u.email}</div>
                  </td>
                  <td className="ad-addr" title={u.formatted_address || ""}>
                    {u.formatted_address || <span className="ad-sub">ยังไม่ได้ตั้งตำแหน่ง</span>}
                  </td>
                  <td className="text-end">{u.meter_count}</td>
                  <td className="text-end al-time">{num(u.month_kwh)}</td>
                  <td className="text-end al-time">
                    {num(u.month_cost)}
                    {pct != null && <span className="ad-sub"> / {num(u.monthly_budget, 0)} ({pct.toFixed(0)}%)</span>}
                  </td>
                  <td>
                    {u.open_alerts > 0 ? (
                      <span className="al-pill al-pill-high"><i /> ค้าง {u.open_alerts}</span>
                    ) : (
                      <span className="al-pill al-pill-low"><i /> ปกติ</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
