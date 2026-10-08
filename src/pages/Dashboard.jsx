import { useEffect, useState } from "react";
import axiosInstance from "../api/axiosInstance";
import { useAuth } from "../context/AuthContext";
import PowerChart from "../components/charts/PowerChart";
import StatCard from "../components/common/StatCard";

export default function Dashboard() {
  const { user: authUser } = useAuth();
  const userId = authUser.user_id;
  const [user, setUser] = useState(null);
  const [readings, setReadings] = useState([]);
  const [summary, setSummary] = useState({ record_count: 0, total_kwh: 0, total_cost: 0 });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

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
  }, [userId]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;


  const latest = readings[readings.length - 1];

  return (
    <div>
      <h2>Dashboard</h2>
      <p className="text-secondary">สวัสดี, {user.full_name}</p>

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
    </div>
  );
}