import { useEffect, useState } from "react";
import { Alert, Button, Form, Modal } from "react-bootstrap";
import { FaTrash } from "react-icons/fa6";
import axiosInstance from "../api/axiosInstance";
import { useAuth } from "../context/AuthContext";
import PowerChart from "../components/charts/PowerChart";
import StatCard from "../components/common/StatCard";

export default function Dashboard() {
  const { user: authUser, isAdmin } = useAuth();
  const userId = authUser.user_id;
  const [user, setUser] = useState(null);
  const [readings, setReadings] = useState([]);
  const [summary, setSummary] = useState({ record_count: 0, total_kwh: 0, total_cost: 0 });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // ---------- ล้างข้อมูล (admin เท่านั้น) ----------
  const [showClear, setShowClear] = useState(false);
  const [clearTarget, setClearTarget] = useState(String(authUser.user_id));
  const [confirmed, setConfirmed] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    Promise.all([
      axiosInstance.get(`/users/${userId}`),
      axiosInstance.get(`/readings/${userId}`, { params: { limit: 96 } }),
      axiosInstance.get(`/readings/${userId}/summary`),
    ])
      .then(([userRes, readingsRes, sumRes]) => {
        setUser(userRes.data);
        setReadings([...readingsRes.data].reverse());
        setSummary(sumRes.data);
      })
      .catch((err) => setError(err.userMessage))
      .finally(() => setLoading(false));
  }, [userId, reloadKey]);

  const closeClear = () => {
    setShowClear(false);
    setConfirmed(false);
    setClearError("");
  };

  const handleClear = async () => {
    setClearing(true);
    setClearError("");
    try {
      await axiosInstance.delete(`/readings/${Number(clearTarget)}`, {
        params: { admin_id: authUser.user_id },
      });
      closeClear();
      setReloadKey((k) => k + 1); // โหลดข้อมูลใหม่ (ไม่สลับเป็นหน้า Loading)
    } catch (e) {
      setClearError(e.userMessage || "ลบข้อมูลไม่สำเร็จ");
    } finally {
      setClearing(false);
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;

  const latest = readings[readings.length - 1];

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start">
        <div>
          <h2>Dashboard</h2>
          <p className="text-secondary">สวัสดี, {user.full_name}</p>
        </div>
        {isAdmin && (
          <Button variant="outline-danger" size="sm" onClick={() => setShowClear(true)}>
            <FaTrash /> ล้างข้อมูล
          </Button>
        )}
      </div>

      <div className="stat-grid">
        <StatCard
          label="พลังงานรวม"
          value={summary.total_kwh.toFixed(2)}
          unit="kWh"
          hint={`สะสมทั้งหมด (${summary.record_count} รายการ)`}
        />
        <StatCard
          label="ค่าไฟรวม"
          value={summary.total_cost.toFixed(2)}
          unit="บาท"
          hint={`สะสมทั้งหมด (${summary.record_count} รายการ)`}
        />
        <StatCard
          label="แรงดันไฟฟ้าล่าสุด"
          value={latest ? Number(latest.voltage).toFixed(1) : "-"}
          unit="V"
        />
        <StatCard
          label="กระแสไฟฟ้าล่าสุด"
          value={latest ? Number(latest.current).toFixed(2) : "-"}
          unit="A"
        />
      </div>

      <div className="card-dark mt-3">
        <h5 className="mb-3">การใช้ไฟฟ้า 96 รายการล่าสุด</h5>
        {readings.length === 0 ? (
          <p className="text-secondary">ยังไม่มีข้อมูล</p>
        ) : (
          <PowerChart readings={readings} />
        )}
      </div>

      {/* Modal ล้างข้อมูล (admin เท่านั้น) */}
      <Modal show={showClear} onHide={closeClear} centered data-bs-theme="dark">
        <Modal.Header closeButton>
          <Modal.Title>ล้างข้อมูลการใช้ไฟฟ้า</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {clearError && <Alert variant="danger">{clearError}</Alert>}
          <Form.Group className="mb-3">
            <Form.Label>user_id ที่ต้องการล้างข้อมูล</Form.Label>
            <Form.Control
              type="number"
              min="1"
              value={clearTarget}
              onChange={(e) => {
                setClearTarget(e.target.value);
                setConfirmed(false);
              }}
            />
          </Form.Group>
          <Form.Check
            id="clear-confirm"
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            label="ยืนยันลบข้อมูลdashboard(กู้ไม่ได้)"
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeClear}>ยกเลิก</Button>
          <Button
            variant="danger"
            disabled={clearing || !confirmed || !clearTarget}
            onClick={handleClear}
          >
            {clearing ? "กำลังลบ" : "ลบข้อมูลทั้งหมด"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}