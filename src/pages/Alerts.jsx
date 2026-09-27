import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Form, Spinner, Modal, Button } from "react-bootstrap";
import { FaCheck, FaPlus } from "react-icons/fa6";
import api from "../api/axiosInstance";
import { getAlertsByUser, resolveAlert, createAlert } from "../api/alertApi";
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

const EMPTY_CREATE_FORM = {
  user_id: "",
  meter_id: "",
  alert_type: "anomaly_spike",
  severity: "medium",
  message: "",
};

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

  // ---------- Create Alert (admin เท่านั้น) ----------
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [createMeters, setCreateMeters] = useState([]); // มิเตอร์ของ user_id ที่กรอกในฟอร์ม
  const [metersLoading, setMetersLoading] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");

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

  // ---------- Create Alert handlers ----------

  const openCreateModal = () => {
    setCreateForm({ ...EMPTY_CREATE_FORM, user_id: String(activeUserId || "") });
    setCreateMeters([]);
    setCreateError("");
    setShowCreateModal(true);
    if (activeUserId) loadMetersForCreateForm(activeUserId);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateMeters([]);
    setCreateError("");
  };

  const loadMetersForCreateForm = async (userId) => {
    if (!userId) {
      setCreateMeters([]);
      return;
    }
    setMetersLoading(true);
    setCreateError("");
    try {
      const { data } = await api.get(`/meters/${userId}`);
      setCreateMeters(data);
      // ถ้า meter_id เดิมไม่อยู่ในรายการใหม่แล้ว ให้เคลียร์ทิ้ง
      setCreateForm((f) =>
        data.some((m) => String(m.meter_id) === String(f.meter_id)) ? f : { ...f, meter_id: "" }
      );
      if (data.length === 0) {
        setCreateError("user_id นี้ยังไม่มีมิเตอร์ในระบบ กรุณาเพิ่มมิเตอร์ก่อนสร้างแจ้งเตือน");
      }
    } catch (e) {
      setCreateMeters([]);
      setCreateError(e.userMessage || "โหลดรายชื่อมิเตอร์ไม่สำเร็จ (ตรวจสอบว่ามี user_id นี้อยู่จริง)");
    } finally {
      setMetersLoading(false);
    }
  };

  const handleCreateChange = (e) => {
    setCreateForm({ ...createForm, [e.target.name]: e.target.value });
  };

  const handleLoadMetersClick = () => {
    loadMetersForCreateForm(createForm.user_id);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError("");

    if (!createForm.user_id) {
      setCreateError("กรุณากรอก user_id");
      return;
    }
    if (!createForm.meter_id) {
      setCreateError("กรุณาเลือกมิเตอร์ (กด \"โหลดมิเตอร์\" ก่อนถ้ายังไม่เห็นตัวเลือก)");
      return;
    }
    if (!createForm.message.trim()) {
      setCreateError("กรุณากรอกรายละเอียด");
      return;
    }

    setCreateSubmitting(true);
    try {
      await createAlert({
        user_id: Number(createForm.user_id),
        meter_id: Number(createForm.meter_id),
        alert_type: createForm.alert_type,
        severity: createForm.severity,
        message: createForm.message.trim(),
        is_resolved: false,
      });
      closeCreateModal();
      // ถ้า user_id ที่เพิ่งสร้าง alert ให้ ตรงกับหน้าที่กำลังดูอยู่ ให้รีเฟรชตารางทันที
      if (Number(createForm.user_id) === activeUserId) {
        await load();
      }
    } catch (e) {
      setCreateError(e.userMessage || "สร้างแจ้งเตือนไม่สำเร็จ");
    } finally {
      setCreateSubmitting(false);
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
        <div className="d-flex align-items-center gap-2">
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
          {isAdmin && (
            <button className="mt-add-btn" onClick={openCreateModal}>
              <FaPlus /> Create Alert
            </button>
          )}
        </div>
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

      {/* Modal สร้างแจ้งเตือน (admin เท่านั้น) */}
      <Modal show={showCreateModal} onHide={closeCreateModal} centered data-bs-theme="dark">
        <Form onSubmit={handleCreateSubmit}>
          <Modal.Header closeButton>
            <Modal.Title>Create Alert</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {createError && <Alert variant="danger">{createError}</Alert>}

            <Form.Group className="mb-3">
              <Form.Label>User ID ของเจ้าของมิเตอร์ *</Form.Label>
              <div className="d-flex gap-2">
                <Form.Control
                  type="number"
                  name="user_id"
                  min="1"
                  value={createForm.user_id}
                  onChange={handleCreateChange}
                  placeholder="เช่น 50"
                />
                <Button
                  variant="outline-light"
                  onClick={handleLoadMetersClick}
                  disabled={metersLoading || !createForm.user_id}
                >
                  {metersLoading ? "กำลังโหลด..." : "โหลดมิเตอร์"}
                </Button>
              </div>
              <Form.Text className="text-secondary">
                กด "โหลดมิเตอร์" ก่อนเพื่อดึงรายชื่อมิเตอร์ของ user คนนี้มาเลือก
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>มิเตอร์ *</Form.Label>
              <Form.Select
                name="meter_id"
                value={createForm.meter_id}
                onChange={handleCreateChange}
                disabled={createMeters.length === 0}
              >
                <option value="">-- เลือกมิเตอร์ --</option>
                {createMeters.map((m) => (
                  <option key={m.meter_id} value={m.meter_id}>
                    {m.meter_serial} {m.location ? `(${m.location})` : ""}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>ประเภทการแจ้งเตือน</Form.Label>
              <Form.Select name="alert_type" value={createForm.alert_type} onChange={handleCreateChange}>
                <option value="anomaly_spike">กระแสไฟฟ้าพุ่งสูงผิดปกติ (anomaly_spike)</option>
                <option value="over_budget">ใช้งานเกินงบประมาณ (over_budget)</option>
                <option value="device_fault">อุปกรณ์ขัดข้อง (device_fault)</option>
                <option value="other">อื่นๆ (other)</option>
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>ความรุนแรง</Form.Label>
              <Form.Select name="severity" value={createForm.severity} onChange={handleCreateChange}>
                <option value="low">ต่ำ</option>
                <option value="medium">ปานกลาง</option>
                <option value="high">สูง</option>
              </Form.Select>
            </Form.Group>

            <Form.Group>
              <Form.Label>รายละเอียด *</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                name="message"
                value={createForm.message}
                onChange={handleCreateChange}
                placeholder="เช่น ไฟรั่วที่เต้ารับห้องครัว"
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={closeCreateModal}>ยกเลิก</Button>
            <Button type="submit" variant="success" disabled={createSubmitting}>
              {createSubmitting ? "กำลังบันทึก..." : "สร้างแจ้งเตือน"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
