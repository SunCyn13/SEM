import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Spinner } from "react-bootstrap";
import { getUser, createLineLinkCode, unlinkLine } from "../../api/userApi";
import { useAuth } from "../../context/AuthContext";

const CODE_TTL_MS = 5 * 60 * 1000; // ตรงกับ backend (หมดอายุ 5 นาที)

export default function LineConnectCard() {
  const { user } = useAuth();
  const userId = user.user_id;

  const [linked, setLinked] = useState(null); // null = กำลังโหลด
  const [code, setCode] = useState(null);     // { value, expiresAt }
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await getUser(userId);
      setLinked(Boolean(data.line_linked));
      return Boolean(data.line_linked);
    } catch (e) {
      setError(e.userMessage || "โหลดสถานะ LINE ไม่สำเร็จ");
      return false;
    }
  }, [userId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // นับถอยหลัง + เคลียร์รหัสเมื่อหมดเวลา
  useEffect(() => {
    if (!code) return;
    const tick = () => {
      const left = Math.max(0, Math.round((code.expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setCode(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [code]);

  // ระหว่างรอผู้ใช้พิมพ์รหัสใน LINE: ถามสถานะทุก 3 วินาที
  useEffect(() => {
    if (!code) return;
    const id = setInterval(async () => {
      if (await loadStatus()) setCode(null);
    }, 3000);
    return () => clearInterval(id);
  }, [code, loadStatus]);

  const handleRequestCode = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await createLineLinkCode(userId);
      // ใช้เวลาฝั่ง client นับเอง (datetime จาก backend ไม่มี timezone)
      setCode({ value: data.line_link_code, expiresAt: Date.now() + CODE_TTL_MS });
    } catch (e) {
      setError(e.userMessage || "ขอรหัสไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    if (!window.confirm("ยกเลิกการผูกบัญชี LINE ใช่หรือไม่? คุณจะไม่ได้รับแจ้งเตือนผ่าน LINE อีก")) return;
    setBusy(true);
    setError("");
    try {
      await unlinkLine(userId);
      setLinked(false);
      setCode(null);
    } catch (e) {
      setError(e.userMessage || "ยกเลิกการผูกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="card-dark">
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h5 className="mb-1">การแจ้งเตือนผ่าน LINE</h5>
          <div className="small text-secondary">
            รับแจ้งเตือนเมื่อไฟพุ่งผิดปกติหรือค่าไฟเกินงบ
          </div>
        </div>
        {linked !== null && (
          <span className={`badge ${linked ? "text-bg-success" : "text-bg-secondary"}`}>
            {linked ? "ผูกแล้ว" : "ยังไม่ผูก"}
          </span>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {linked === null && <Spinner size="sm" />}

      {linked === true && (
        <Button variant="outline-danger" size="sm" onClick={handleUnlink} disabled={busy}>
          ยกเลิกการผูกบัญชี LINE
        </Button>
      )}

      {linked === false && !code && (
        <Button onClick={handleRequestCode} disabled={busy}>
          {busy ? "กำลังขอรหัส..." : "ขอรหัสผูกบัญชี LINE"}
        </Button>
      )}

      {linked === false && code && (
        <div>
          <ol className="small text-secondary ps-3">
            <li>เพิ่มเพื่อนบอท Smart Energy ใน LINE</li>
            <li>พิมพ์รหัส 6 หลักด้านล่างในแชท</li>
            <li>หน้านี้จะอัปเดตเองเมื่อผูกสำเร็จ</li>
          </ol>
          <div
            className="text-center my-3"
            style={{ fontSize: "2.2rem", fontWeight: 700, letterSpacing: 10, color: "var(--accent)" }}
          >
            {code.value}
          </div>
          <div className="text-center small text-secondary mb-3">
            หมดอายุใน {mm}:{ss}
          </div>
          <div className="text-center">
            <Button variant="outline-light" size="sm" onClick={handleRequestCode} disabled={busy}>
              ขอรหัสใหม่
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}