import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Form, Button, Alert, Card } from "react-bootstrap";
import { createUser } from "../api/userApi";

const EMPTY_FORM = {
  full_name: "",
  email: "",
  password: "",
  phone: "",
  address: "",
  province: "",
  monthly_budget: "",
};

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const validate = () => {
    if (!form.full_name.trim()) return "กรุณากรอกชื่อ-นามสกุล";
    if (!form.email.trim()) return "กรุณากรอกอีเมล";
    if (form.password.length < 8) return "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
    if (!/^\d{10}$/.test(form.phone)) return "เบอร์โทรต้องเป็นตัวเลข 10 หลัก";
    if (!form.address.trim()) return "กรุณากรอกที่อยู่";
    if (!form.province.trim()) return "กรุณากรอกจังหวัด";
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError("");
    setLoading(true);
    try {
      await createUser({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone,
        address: form.address.trim(),
        province: form.province.trim(),
        monthly_budget: form.monthly_budget ? Number(form.monthly_budget) : null,
      });
      navigate("/login", { state: { registered: true } });
    } catch (err) {
      setError(err.userMessage || err.response?.data?.detail || "สมัครสมาชิกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="d-flex align-items-center justify-content-center vh-100 bg-dark py-4">
      <Card bg="dark" text="light" style={{ width: 420 }} className="p-4 border-secondary">
        <h3 className="text-center mb-4">สมัครสมาชิก</h3>
        {error && <Alert variant="danger">{error}</Alert>}
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label>ชื่อ-นามสกุล</Form.Label>
            <Form.Control name="full_name" value={form.full_name} onChange={handleChange} required />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>อีเมล</Form.Label>
            <Form.Control type="email" name="email" value={form.email} onChange={handleChange} required />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)</Form.Label>
            <Form.Control type="password" name="password" value={form.password} onChange={handleChange} required />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>เบอร์โทร (10 หลัก)</Form.Label>
            <Form.Control name="phone" value={form.phone} onChange={handleChange} placeholder="0812345678" required />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>ที่อยู่</Form.Label>
            <Form.Control name="address" value={form.address} onChange={handleChange} required />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>จังหวัด</Form.Label>
            <Form.Control name="province" value={form.province} onChange={handleChange} required />
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>งบค่าไฟต่อเดือน (บาท) — ไม่บังคับ</Form.Label>
            <Form.Control
              type="number"
              name="monthly_budget"
              value={form.monthly_budget}
              onChange={handleChange}
              min="0"
            />
          </Form.Group>
          <Button type="submit" className="w-100" disabled={loading}>
            {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
          </Button>
        </Form>
        <div className="text-center mt-3 small">
          มีบัญชีอยู่แล้ว? <Link to="/login">เข้าสู่ระบบ</Link>
        </div>
      </Card>
    </div>
  );
}