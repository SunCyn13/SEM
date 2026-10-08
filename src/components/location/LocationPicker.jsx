import { useState } from "react";
import { Alert } from "react-bootstrap";
import { updateLocation } from "../../api/userApi";
import AddressForm from "./AddressForm";
import MapPinPicker from "./MapPinPicker";

const SOURCE_LABEL = { places: "ค้นหาจากที่อยู่", manual: "ปักหมุดเอง" };

export default function LocationPicker({ profile, onSaved }) {
  const [mode, setMode] = useState("address");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const hasSaved = profile.latitude != null && profile.longitude != null;
  const savedPin = hasSaved
    ? { lat: Number(profile.latitude), lng: Number(profile.longitude) }
    : null;

  const save = async (payload) => {
    setBusy(true);
    setError("");
    setOk(false);
    try {
      const { data } = await updateLocation(profile.user_id, payload);
      onSaved(data);
      setOk(true);
    } catch (e) {
      setError(e.userMessage || "บันทึกตำแหน่งไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-dark">
      <h5 className="mb-1">ตำแหน่งที่ตั้ง</h5>
      <div className="small text-secondary mb-3">
        ใช้แสดงตำแหน่งมิเตอร์บนแผนที่ของระบบ
      </div>

      {hasSaved ? (
        <div className="mb-3 small">
          <div>{profile.formatted_address || "-"}</div>
          <div className="text-secondary">
            {savedPin.lat.toFixed(6)}, {savedPin.lng.toFixed(6)}
            {profile.location_source && ` · ${SOURCE_LABEL[profile.location_source] || profile.location_source}`}
          </div>
        </div>
      ) : (
        <p className="small text-secondary">ยังไม่ได้ตั้งตำแหน่ง</p>
      )}

      <div className="d-flex gap-2 mb-3">
        <button
          className={`btn btn-sm ${mode === "address" ? "btn-accent" : "btn-ghost"}`}
          onClick={() => setMode("address")}
        >
          พิมพ์ที่อยู่
        </button>
        <button
          className={`btn btn-sm ${mode === "pin" ? "btn-accent" : "btn-ghost"}`}
          onClick={() => setMode("pin")}
        >
          ปักหมุดบนแผนที่
        </button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {ok && <Alert variant="success">บันทึกตำแหน่งเรียบร้อยแล้ว</Alert>}

      {mode === "address" ? (
        <AddressForm busy={busy} onSubmit={(address) => save({ mode: "address", address })} />
      ) : (
        <MapPinPicker
          initial={savedPin}
          busy={busy}
          onSubmit={(pos) => save({ mode: "pin", ...pos })}
        />
      )}
    </div>
  );
}