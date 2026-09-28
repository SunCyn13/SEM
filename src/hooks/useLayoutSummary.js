import { useCallback, useEffect, useState } from "react";
import { getUser } from "../api/userApi";
import { getAlertsByUser } from "../api/alertApi";
import api from "../api/axiosInstance";

const INITIAL = { profile: null, meterCount: 0, openAlerts: 0, apiOnline: null };

/**
 * ดึงข้อมูลสรุปที่ Sidebar และ Navbar ใช้ร่วมกัน
 * - profile      : ข้อมูลผู้ใช้ (ที่อยู่, line_linked)
 * - meterCount   : จำนวนมิเตอร์ของผู้ใช้
 * - openAlerts   : จำนวน alert ที่ยังไม่แก้ไข
 * - apiOnline    : true/false = เข้าถึง backend ได้หรือไม่ (null = กำลังเช็ค)
 * รีเฟรชอัตโนมัติทุก intervalMs
 */
export default function useLayoutSummary(userId, intervalMs = 30000) {
  const [summary, setSummary] = useState(INITIAL);

  const refresh = useCallback(async () => {
    if (!userId) return;

    const [u, m, a] = await Promise.allSettled([
      getUser(userId),
      api.get(`/meters/${userId}`),
      getAlertsByUser(userId),
    ]);

    // ถ้า request ไหนได้ response กลับมา (แม้เป็น 4xx/5xx) = backend ยังอยู่
    // ถ้าไม่มี response เลย (network error) ทั้งหมด = offline
    const results = [u, m, a];
    const apiOnline = results.some(
      (r) => r.status === "fulfilled" || Boolean(r.reason?.response)
    );

    setSummary((prev) => ({
      profile: u.status === "fulfilled" ? u.value.data : prev.profile,
      meterCount: m.status === "fulfilled" ? m.value.data.length : prev.meterCount,
      openAlerts:
        a.status === "fulfilled"
          ? a.value.data.filter((x) => !x.is_resolved).length
          : prev.openAlerts,
      apiOnline,
    }));
  }, [userId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { ...summary, refresh };
}
