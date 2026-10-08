import argparse
import random
import sys
import time
from datetime import datetime, timedelta

import requests

API = "http://localhost:8000"
INTERVAL_MIN = 15      # ช่วงเวลาต่อ 1 record 
RATE_PER_KWH = 4.0     # อัตราค่าไฟ บาท/หน่วย
SPIKE_CHANCE = 0.01    # โอกาสผิดพลาด

def fetch_user(user_id: int) -> dict:
    try:
        r = requests.get(f"{API}/users/{user_id}", timeout=10)
    except requests.RequestException as e:
        sys.exit(f"เชื่อมbackendไม่ได้({API})เช็คuvicorn{e}")
    if r.status_code == 404:
        sys.exit(f"ไม่เจอ user_id {user_id} (สมัครสมาชิกหรือสร้าง user ก่อน)")
    r.raise_for_status()
    return r.json()

def get_or_create_meter(user_id: int, serial: str) -> int:
    r = requests.get(f"{API}/meters/{user_id}", timeout=10)
    r.raise_for_status()
    for m in r.json():
        if m["meter_serial"] == serial:
            return m["meter_id"]

    r = requests.post(
        f"{API}/meters",
        json={
            "user_id": user_id,
            "meter_serial": serial,
            "location": "บ้านหลัก",
            "device_type": "main",
            "status": "active",
        },
        timeout=10,
    )
    if r.status_code != 200:
        sys.exit(f"สร้างมิเตอร์ไม่สำเร็จ: {r.status_code} {r.text}")
    return r.json()["meter_id"]


def has_existing_readings(user_id: int) -> bool:
    r = requests.get(f"{API}/readings/{user_id}", params={"limit": 1}, timeout=10)
    r.raise_for_status()
    return len(r.json()) > 0

def base_power_kw(hour: int) -> float:
    """กำลังไฟเฉลี่ย(kW)ตามช่วงเวลา:เช้ากับเย็นเยอะ,กลางคืนต่ำ"""
    if 0 <= hour < 5:
        return 0.3
    if 5 <= hour < 8:
        return 0.9
    if 8 <= hour < 17:
        return 0.6
    if 17 <= hour < 22:
        return 1.6  
    return 0.7

def build_reading(user_id: int, meter_id: int, ts: datetime, power_kw: float) -> dict:
    voltage = round(random.uniform(220 * 0.95, 220 * 1.05), 2) #มาตรฐานแรงดันไฟ 220V จะ+-5% เพราะไฟมีโอกาสสวิง
    current = round(power_kw * 1000 / voltage, 2) #คำนวณปริมาณกระแสไฟฟ้าที่ไหลผ่าน (แอมแปร์ / A)
    kwh = round(power_kw * (INTERVAL_MIN / 60), 4) #คำนวณปริมาณพลังงานไฟฟ้าที่ใช้ (หน่วย: กิโลวัตต์-ชั่วโมง / kWh)
    cost = round(kwh * RATE_PER_KWH, 2) #คำนวณค่าไฟ
    return {
        "user_id": user_id,
        "meter_id": meter_id,
        "timestamp": ts.isoformat(),
        "kwh": kwh,
        "voltage": voltage,
        "current": current,
        "cost": cost,
    }

def normal_power(ts: datetime, allow_spike: bool = True) -> float:
    power = base_power_kw(ts.hour) * random.uniform(0.8, 1.2)
    if allow_spike and random.random() < SPIKE_CHANCE:
        power *= random.uniform(2.5, 4.0)   #จำลองไฟพุ่ง
    return power

def spike_power() -> float:
    """กำลังไฟที่ให้กระแสประมาณ 22-32 A (เกินthreshold 16 A)"""
    amp = random.uniform(22, 32)
    return amp * 220 / 1000

def floor_to_interval(dt: datetime) -> datetime:
    return dt.replace(minute=dt.minute - dt.minute % INTERVAL_MIN, second=0, microsecond=0)


def post_reading(session: requests.Session, payload: dict) -> bool:
    r = session.post(f"{API}/readings", json=payload, timeout=10)
    if r.status_code != 200:
        print(f"ล้มเหลว: {r.status_code} {r.text}")
        return False
    return True

def run_backfill(user_id: int, meter_id: int, days: int | None):
    now = floor_to_interval(datetime.now())
    if days is None:
        start = now.replace(day=1, hour=0, minute=0)
        label = "ตั้งแต่ต้นเดือนนี้"
    else:
        start = floor_to_interval(now - timedelta(days=days))
        label = f"ย้อนหลัง {days} วัน"

    total = int((now - start).total_seconds() // 60 // INTERVAL_MIN) + 1
    print(f"โหมดย้อนหลัง: {label} ({start:%Y-%m-%d %H:%M} -> {now:%Y-%m-%d %H:%M}) ~{total} รายการ")

    session = requests.Session()
    ts, sent = start, 0
    while ts <= now:
        if not post_reading(session, build_reading(user_id, meter_id, ts, normal_power(ts))):
            print(f"หยุดที่ {ts}")
            break
        sent += 1
        if sent % 50 == 0:
            print(f"ส่งแล้ว {sent}/{total} รายการ...")
        ts += timedelta(minutes=INTERVAL_MIN)
        time.sleep(0.02) # เว้นจังหวะไม่ให้ยิงรัวเกินไป

    print(f"เสร็จสิ้น: ส่งทั้งหมด {sent} รายการ")

def run_spike(user_id: int, meter_id: int):
    payload = build_reading(user_id, meter_id, datetime.now().replace(microsecond=0), spike_power())
    if post_reading(requests.Session(), payload):
        print(f"ส่งค่าพุ่งแล้ว: กระแส {payload['current']} A แรงดัน {payload['voltage']} V")
        print("ถ้าไม่เห็น alert ใหม่ แปลว่ามี anomaly_spike ที่ยังไม่ resolve ของมิเตอร์นี้อยู่ (กด 'แก้ไขแล้ว' ก่อน)")

def run_live(user_id: int, meter_id: int, every: float):
    print(f"โหมด live: ส่งทุก {every:g} วินาที (กด Ctrl+C เพื่อหยุด)")
    session = requests.Session()
    sent = 0
    try:
        while True:
            now = datetime.now().replace(microsecond=0)
            payload = build_reading(user_id, meter_id, now, normal_power(now))
            if not post_reading(session, payload):
                break
            sent += 1
            print(f"[{now:%H:%M:%S}] {payload['current']:>6} A  {payload['voltage']} V  {payload['cost']} บาท")
            time.sleep(every)
    except KeyboardInterrupt:
        print(f"\nหยุดแล้ว: ส่งทั้งหมด {sent} รายการ")

def main():
    p = argparse.ArgumentParser(description="จำลองข้อมูลมิเตอร์ส่งเข้า Smart Energy backend")
    p.add_argument("user_id", type=int, help="user_id ของเจ้าของมิเตอร์")
    p.add_argument("--days", type=int, help="ย้อนหลังกี่วัน (ค่าเริ่มต้น: ตั้งแต่ต้นเดือน)")
    p.add_argument("--force", action="store_true", help="ยิงต่อแม้ user นี้มีข้อมูลอยู่แล้ว (จะเกิดข้อมูลซ้ำ)")
    p.add_argument("--spike", action="store_true", help="ส่งค่ากระแสพุ่ง 1 ครั้ง")
    p.add_argument("--live", action="store_true", help="ส่งข้อมูลสดต่อเนื่อง")
    p.add_argument("--every", type=float, default=5, help="ช่วงเวลาส่งในโหมด live (วินาที, ค่าเริ่มต้น 5)")
    args = p.parse_args()

    if args.spike and args.live:
        sys.exit("เลือกได้อย่างใดอย่างหนึ่งระหว่าง --spike กับ --live")
    if args.days is not None and args.days < 1:
        sys.exit("--days ต้องมากกว่า 0")
    if args.every <= 0:
        sys.exit("--every ต้องมากกว่า 0")

    user = fetch_user(args.user_id)
    budget = user.get("monthly_budget")
    print(f"ผู้ใช้: {user['full_name']} (user_id {args.user_id})")
    print(f"งบรายเดือน: {float(budget):,.2f} บาท" if budget is not None else "งบรายเดือน: ยังไม่ได้ตั้ง (จะไม่มี alert over_budget)")
    if user.get("line_linked"):
        print("LINE: ผูกแล้ว -> alert ที่เกิดขึ้นจะส่งข้อความเข้า LINE จริง")
    else:
        print("LINE: ยังไม่ผูก (alert จะขึ้นในระบบอย่างเดียว)")

    serial = f"MTR-{args.user_id}-001"
    meter_id = get_or_create_meter(args.user_id, serial)
    print(f"ใช้มิเตอร์ {serial} (meter_id = {meter_id})")

    if args.spike:
        run_spike(args.user_id, meter_id)
    elif args.live:
        run_live(args.user_id, meter_id, args.every)
    else:
        if has_existing_readings(args.user_id) and not args.force:
            sys.exit(
                "user นี้มีข้อมูลอยู่แล้ว หยุดเพื่อกันข้อมูลซ้ำ "
                "(ตารางไม่มี unique) ถ้าตั้งใจให้ซ้ำใส่ --force"
            )
        run_backfill(args.user_id, meter_id, args.days)


if __name__ == "__main__":
    main()