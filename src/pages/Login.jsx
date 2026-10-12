import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Form, Button, Alert, Card } from "react-bootstrap";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="d-flex align-items-center justify-content-center vh-100 bg-dark">
      <Card bg="dark" text="light" style={{ width: 380 }} className="p-4 border-secondary">
        <h3 className="text-center mb-4">Smart Energy Monitoring</h3>
        {state?.registered && <Alert variant="success">สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ</Alert>}
        {error && <Alert variant="danger">{error}</Alert>}
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label>Email</Form.Label>
            <Form.Control type="email" value={email} required
              onChange={(e) => setEmail(e.target.value)} />
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>รหัสผ่าน</Form.Label>
            <Form.Control type="password" value={password} required
              onChange={(e) => setPassword(e.target.value)} />
          </Form.Group>
          <Button type="submit" className="w-100" disabled={loading}>
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </Button>
        </Form>
        <div className="text-center mt-3 small">
          ยังไม่มีบัญชี? <Link to="/register">สมัครสมาชิก</Link>
        </div>
      </Card>
    </div>
  );
}