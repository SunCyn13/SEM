import { useEffect, useState } from "react";
import { Alert, Spinner } from "react-bootstrap";
import { getUser } from "../api/userApi";
import { useAuth } from "../context/AuthContext";
import LineConnectCard from "../components/line/LineConnectCard";
import LocationPicker from "../components/location/LocationPicker";

const Row = ({ label, value }) => (
  <div className="d-flex justify-content-between py-2 border-bottom" style={{ borderColor: "var(--border)" }}>
    <span className="text-secondary">{label}</span>
    <span>{value || "-"}</span>
  </div>
);

export default function Settings() {
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getUser(authUser.user_id)
      .then((res) => setProfile(res.data))
      .catch((e) => setError(e.userMessage || "โหลดโปรไฟล์ไม่สำเร็จ"));
  }, [authUser.user_id]);

  return (
    <div>
      <h2>Settings</h2>
      <p className="text-secondary">โปรไฟล์และการเชื่อมต่อของบัญชีคุณ</p>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="row g-3">
        <div className="col-lg-6">
          <div className="card-dark">
            <h5 className="mb-3">โปรไฟล์</h5>
            {!profile && !error && <Spinner size="sm" />}
            {profile && (
              <>
                <Row label="ชื่อ-นามสกุล" value={profile.full_name} />
                <Row label="อีเมล" value={profile.email} />
                <Row label="เบอร์โทร" value={profile.phone} />
                <Row label="ที่อยู่" value={profile.address} />
                <Row label="พิกัด"value={profile.latitude != null && profile.longitude != null? `${Number(profile.latitude).toFixed(6)}, ${Number(profile.longitude).toFixed(6)}`: null} />
                <Row label="งบค่าไฟต่อเดือน"
                  value={profile.monthly_budget != null ? `${Number(profile.monthly_budget).toLocaleString()} บาท` : null}
                />
                <Row label="บทบาท" value={profile.role} />
              </>
            )}
          </div>
        </div>

        <div className="col-lg-6">
          <LineConnectCard />
        </div>
        
        {profile && (
          <div className="col-12">
            <LocationPicker profile={profile} onSaved={setProfile} />
          </div>
        )}
      </div>
    </div>
  );
}