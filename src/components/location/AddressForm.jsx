import { useState } from "react";
import { Button, Form } from "react-bootstrap";

export default function AddressForm({ onSubmit, busy }) {
  const [address, setAddress] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!address.trim()) return;
    onSubmit(address.trim());
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Form.Group className="mb-3">
        <Form.Label>ที่อยู่หรือชื่อสถานที่</Form.Label>
        <Form.Control
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="เช่น  175 หมู่ 12 ถ.มาลัยแมน ตำบลกำแพงแสน  "
        />
      </Form.Group>
      <Button type="submit" disabled={busy || !address.trim()}>
        {busy ? "กำลังค้นหา" : "ค้นหาและบันทึกตำแหน่ง"}
      </Button>
    </Form>
  );
}