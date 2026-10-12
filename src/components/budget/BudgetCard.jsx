import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Form, InputGroup, ProgressBar } from "react-bootstrap";
import { getBillPrediction, updateBudget } from "../../api/userApi";

const fmt = (n) =>
  Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BudgetCard({ profile, onSaved }) {
  const userId = profile.user_id;
  const saved = profile.monthly_budget != null ? Number(profile.monthly_budget) : null;

  const [value, setValue] = useState(saved != null ? String(saved) : "");
  const [pred, setPred] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const loadPrediction = useCallback(async () => {
    try {
      const { data } = await getBillPrediction(userId);
      setPred(data);
    } catch {
      setPred(null); 
    }
  }, [userId]);

  useEffect(() => {
    loadPrediction();
  }, [loadPrediction]);

  const save = async (budget) => {
    setBusy(true);
    setError("");
    setOk("");
    try {
      const { data } = await updateBudget(userId, budget);
      onSaved(data);
      setValue(data.monthly_budget != null ? String(Number(data.monthly_budget)) : "");
      setOk(budget === null ? "ล้างงบเรียบร้อยแล้ว" : "บันทึกงบเรียบร้อยแล้ว");
      loadPrediction();
    } catch (e) {
      setError(e.userMessage || "บันทึกงบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const n = Number(value);
    if (value.trim() === "" || !Number.isFinite(n) || n <= 0) {
      setError("กรุณากรอกจำนวนเงินที่มากกว่า 0");
      setOk("");
      return;
    }
    if (n > 1000000) {
      setError("งบสูงสุด 1,000,000 บาท");
      setOk("");
      return;
    }
    save(Math.round(n * 100) / 100);
  };

  const spent = pred ? Number(pred.month_to_date_cost) : 0;
  const predicted = pred ? Number(pred.predicted_total_cost) : 0;
  const pct = saved ? (spent / saved) * 100 : 0;
  const barVariant = pct >= 100 ? "danger" : pct >= 80 ? "warning" : "success";
  const willExceed = saved && predicted > saved;

  return (
    <div className="card-dark">
      <h5 className="mb-1">งบค่าไฟต่อเดือน</h5>
      <div className="small text-secondary mb-3">
        ระบบจะแจ้งเตือนเมื่อค่าไฟสะสมถึง 80% และ 100% ของงบ
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {ok && <Alert variant="success">{ok}</Alert>}

      <Form onSubmit={handleSubmit}>
        <InputGroup className="mb-3">
          <Form.Control
            type="number"
            min="1"
            step="0.01"
            inputMode="decimal"
            placeholder="เช่น 1500"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="งบค่าไฟต่อเดือน"
          />
          <InputGroup.Text>บาท</InputGroup.Text>
        </InputGroup>
        <div className="d-flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "กำลังบันทึก" : "บันทึก"}
          </Button>
          {saved != null && (
            <Button variant="outline-danger" disabled={busy} onClick={() => save(null)}>
              ล้าง
            </Button>
          )}
        </div>
      </Form>

      {pred && (
        <div className="mt-4">
          <div className="d-flex justify-content-between small mb-1">
            <span className="text-secondary">ค่าไฟเดือนนี้</span>
            <span>
              {fmt(spent)} บาท{saved ? ` (${pct.toFixed(0)}%)` : ""}
            </span>
          </div>
          {saved != null && (
            <ProgressBar now={Math.min(pct, 100)} variant={barVariant} style={{ height: 8 }} />
          )}
          <div className="d-flex justify-content-between small mt-2">
            <span className="text-secondary">คาดการณ์สิ้นเดือน</span>
            <span className={willExceed ? "text-warning" : ""}>{fmt(predicted)} บาท</span>
          </div>
          {willExceed && (
            <div className="small text-warning mt-1">
              ตามอัตราการใช้ตอนนี้ คาดว่าจะเกินงบสิ้นเดือน
            </div>
          )}
        </div>
      )}
    </div>
  );
}