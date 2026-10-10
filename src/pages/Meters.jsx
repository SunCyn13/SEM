import { useCallback, useEffect, useState } from "react";
import { Modal, Form, Button, Alert, Spinner } from "react-bootstrap";
import { FaBolt, FaSnowflake, FaCar, FaRotate, FaPlus } from "react-icons/fa6";
import api from "../api/axiosInstance";
import { useAuth } from "../context/AuthContext";
import "./Meters.css";

const HIGH_LOAD_A = 16; //กระแสค่าHigh Load

const EMPTY_FORM = { user_id: "", meter_serial: "", location: "", device_type: "main", status: "active" };

const DEVICE_ICON = {
  main: <FaBolt />,
  AC: <FaSnowflake />,
  "EV charger": <FaCar />,
};

// สถานะที่แสดง = สถานะใน DB + ค่าอ่านล่าสุด
function getStatus(meter, reading) {
  if (meter.status === "maintenance") return { label: "Maintenance", tone: "warn" };
  if (meter.status === "inactive") return { label: "Offline", tone: "off" };
  if (!reading) return { label: "No data", tone: "off" };
  const amp = Number(reading.current);
  if (amp === 0) return { label: "Standby", tone: "off" };
  if (amp >= HIGH_LOAD_A) return { label: "High Load", tone: "warn" };
  return { label: "Online", tone: "ok" };
}

export default function Meters() {
  const { user, isAdmin } = useAuth();
  const [targetUserId, setTargetUserId] = useState(String(user.user_id));
  const activeUserId = isAdmin ? Number(targetUserId) : user.user_id;

  const [meters, setMeters] = useState([]);
  const [latest, setLatest] = useState({}); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // ตรวจสอบ user ก่อนสร้างmeter
  const [checkingUser, setCheckingUser] = useState(false);
  const [checkedUser, setCheckedUser] = useState(null); // { user_id, full_name } | null

  const load = useCallback(async () => {
    if (!activeUserId) {
      setMeters([]);
      setLatest({});
      setLoading(false);
      return;
    }
    try {
      setError("");
      setLoading(true);
      const [mRes, rRes] = await Promise.all([
        api.get(`/meters/${activeUserId}`),
        api.get(`/readings/${activeUserId}`, { params: { limit: 500 } }),
      ]);
      setMeters(mRes.data);

      const map = {};
      for (const r of rRes.data) if (!(r.meter_id in map)) map[r.meter_id] = r;
      setLatest(map);
    } catch (e) {
      console.error("Meters load error:", e.response?.status, e.response?.data || e.message);
      setError(e.userMessage || "โหลดรายการมิเตอร์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [activeUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (name === "user_id") setCheckedUser(null); 
  };

  const openModal = () => {
    setForm({ ...EMPTY_FORM, user_id: isAdmin ? targetUserId : String(user.user_id) });
    setCheckedUser(null);
    setFormError("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormError("");
    setForm(EMPTY_FORM);
    setCheckedUser(null);
  };

  const handleCheckUser = async () => {
    if (!form.user_id) {
      setFormError("กรุณากรอก user_id ก่อน");
      return;
    }
    setCheckingUser(true);
    setFormError("");
    setCheckedUser(null);
    try {
      const { data } = await api.get(`/users/${form.user_id}`);
      setCheckedUser({ user_id: data.user_id, full_name: data.full_name });
    } catch (e) {
      setFormError(e.userMessage || "ไม่พบผู้ใช้นี้ในระบบ");
    } finally {
      setCheckingUser(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.user_id) {
      setFormError("กรุณากรอก user_id ของเจ้าของมิเตอร์");
      return;
    }
    if (!form.meter_serial.trim()) {
      setFormError("กรุณากรอกรหัสมิเตอร์");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      await api.post("/meters", {
        user_id: Number(form.user_id),
        meter_serial: form.meter_serial.trim(),
        location: form.location.trim() || null,
        device_type: form.device_type,
        status: form.status,
      });
      closeModal();
      if (Number(form.user_id) === activeUserId) {
        await load();
      }
    } catch (e) {
      setFormError(e.userMessage || "เพิ่มมิเตอร์ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-page">
      <div className="mt-header">
        <div>
          <h3>Registered Meters</h3>
          <p>ดูรายการและสถานะมิเตอร์ที่ลงทะเบียนไว้</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          {isAdmin && (
            <Form.Control
              type="number"
              min="1"
              size="sm"
              style={{ width: 130 }}
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              title="user_id ที่ต้องการดูรายการมิเตอร์"
              placeholder="user_id"
            />
          )}
          {isAdmin && (
            <button className="mt-add-btn" onClick={openModal}>
              <FaPlus /> Add New Meter
            </button>
          )}
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="mt-card">
        <table className="mt-table">
          <thead>
            <tr>
              <th>Meter ID / Name</th>
              <th>Location Tag</th>
              <th>Current Load</th>
              <th>Voltage</th>
              <th>Status</th>
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="mt-empty"><Spinner size="sm" /></td></tr>
            )}
            {!loading && meters.length === 0 && (
              <tr><td colSpan={6} className="mt-empty">ยังไม่มีมิเตอร์</td></tr>
            )}
            {meters.map((m) => {
              const r = latest[m.meter_id];
              const st = getStatus(m, r);
              const amp = r ? Number(r.current) : null;
              const volt = r ? Number(r.voltage) : null;
              const kw = r ? (amp * volt) / 1000 : null;
              const loadTone = amp === null || amp === 0 ? "off" : st.tone;

              return (
                <tr key={m.meter_id}>
                  <td>
                    <div className="mt-name">
                      <span className="mt-icon">{DEVICE_ICON[m.device_type] || <FaBolt />}</span>
                      <div>
                        <div className="mt-serial">{m.meter_serial}</div>
                        <div className="mt-sub">{m.device_type || "-"}</div>
                      </div>
                    </div>
                  </td>
                  <td>{m.location || "-"}</td>
                  <td className={`mt-mono mt-load-${loadTone}`}>
                    {r ? `${amp.toFixed(1)} A / ${kw.toFixed(1)} kW` : "-- A / -- kW"}
                  </td>
                  <td className="mt-mono">{r ? `${volt.toFixed(1)} V` : "--"}</td>
                  <td>
                    <span className={`mt-pill mt-pill-${st.tone}`}>
                      <i /> {st.label}
                    </span>
                  </td>
                  <td className="text-end">
                    <button className="mt-act" title="Refresh" onClick={load}>
                      <FaRotate />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal เพิ่มมิเตอร์ — user_id อยู่ในฟอร์มเอง พร้อมปุ่มตรวจสอบผู้ใช้ */}
      <Modal show={showModal} onHide={closeModal} centered data-bs-theme="dark">
        <Form onSubmit={handleSubmit}>
          <Modal.Header closeButton>
            <Modal.Title>Add New Meter</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {formError && <Alert variant="danger">{formError}</Alert>}
            {checkedUser && (
              <Alert variant="success" className="py-2">
                จะเพิ่มมิเตอร์ให้: <strong>{checkedUser.full_name}</strong> (user_id {checkedUser.user_id})
              </Alert>
            )}

            <Form.Group className="mb-3">
              <Form.Label>User ID ของเจ้าของมิเตอร์ *</Form.Label>
              <div className="d-flex gap-2">
                <Form.Control
                  type="number"
                  name="user_id"
                  min="1"
                  value={form.user_id}
                  onChange={handleChange}
                  placeholder="เช่น 50"
                />
                <Button
                  variant="outline-light"
                  onClick={handleCheckUser}
                  disabled={checkingUser || !form.user_id}
                >
                  {checkingUser ? "กำลังตรวจสอบ..." : "ตรวจสอบ"}
                </Button>
              </div>
              <Form.Text className="text-secondary">
                กด "ตรวจสอบ" เพื่อยืนยันว่า user_id นี้มีอยู่จริงก่อนเพิ่มมิเตอร์ให้
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>รหัสมิเตอร์ *</Form.Label>
              <Form.Control name="meter_serial" value={form.meter_serial} onChange={handleChange} placeholder="เช่น MTR-MAIN-001" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>ตำแหน่งติดตั้ง</Form.Label>
              <Form.Control name="location" value={form.location} onChange={handleChange} placeholder="เช่น 1st Floor Breaker Panel" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>ประเภทอุปกรณ์</Form.Label>
              <Form.Select name="device_type" value={form.device_type} onChange={handleChange}>
                <option value="main">main</option>
                <option value="AC">AC</option>
                <option value="EV charger">EV charger</option>
              </Form.Select>
            </Form.Group>
            <Form.Group>
              <Form.Label>สถานะ</Form.Label>
              <Form.Select name="status" value={form.status} onChange={handleChange}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="maintenance">maintenance</option>
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeModal}>ยกเลิก</Button>
            <Button type="submit" variant="success" disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "เพิ่มมิเตอร์"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
