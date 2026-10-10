import random
import time
from datetime import datetime, timedelta

import requests

API = "http://localhost:8000"
USER_ID = 71
METER_SERIAL = "MTR-71-001"   
DAYS_BACK = 3                 # จำลองย้อนหลัง
INTERVAL_MIN = 15             # ทุกกี่นาที 
RATE_PER_KWH = 4.0            
SPIKE_CHANCE = 0.01           


def get_or_create_meter() -> int:
    r = requests.get(f"{API}/meters/{USER_ID}", timeout=10)
    r.raise_for_status()
    for m in r.json():
        if m["meter_serial"] == METER_SERIAL:
            return m["meter_id"]

    r = requests.post(
        f"{API}/meters",
        json={
            "user_id": USER_ID,
            "meter_serial": METER_SERIAL,
            "location": "บ้านหลัก",
            "device_type": "main",
            "status": "active",
        },
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["meter_id"]


def base_power_kw(hour: int) -> float:
    """กำลังไฟเฉลี่ย (kW) ตามช่วงเวลาของวัน: เช้า/เย็นใช้เยอะ กลางคืนต่ำ"""
    if 0 <= hour < 5:
        return 0.3
    if 5 <= hour < 8:
        return 0.9
    if 8 <= hour < 17:
        return 0.6
    if 17 <= hour < 22:
        return 1.6   
    return 0.7

def make_reading(ts: datetime, meter_id: int) -> dict:
    power_kw = base_power_kw(ts.hour) * random.uniform(0.8, 1.2)
    if random.random() < SPIKE_CHANCE:
        power_kw *= random.uniform(2.5, 4.0) 

    voltage = round(random.uniform(220 * 0.95, 220 * 1.05), 2) #มาตรฐานแรงดันไฟ 220V จะ+-5% เพราะไฟมีโอกาสสวิง
    current = round(power_kw * 1000 / voltage, 2) #คำนวณปริมาณกระแสไฟฟ้าที่ไหลผ่าน (แอมแปร์ / A)
    kwh = round(power_kw * (INTERVAL_MIN / 60), 4) #คำนวณปริมาณพลังงานไฟฟ้าที่ใช้ (หน่วย: กิโลวัตต์-ชั่วโมง / kWh)
    cost = round(kwh * RATE_PER_KWH, 2) #คำนวณค่าไฟ

    return {
        "user_id": USER_ID,
        "meter_id": meter_id,
        "timestamp": ts.isoformat(),
        "kwh": kwh,
        "voltage": voltage,
        "current": current,
        "cost": cost,
    }


def main():
    meter_id = get_or_create_meter()
    print(f"ใช้ meter_id = {meter_id}")

    end = datetime.now().replace(second=0, microsecond=0)
    start = end - timedelta(days=DAYS_BACK)

    session = requests.Session()
    ts, sent = start, 0
    while ts <= end:
        r = session.post(f"{API}/readings", json=make_reading(ts, meter_id), timeout=10)
        if r.status_code != 200:
            print(f"ล้มเหลวที่ {ts}: {r.status_code} {r.text}")
            break
        sent += 1
        if sent % 50 == 0:
            print(f"ส่งแล้ว {sent} รายการ...")
        ts += timedelta(minutes=INTERVAL_MIN)
        time.sleep(0.02)   # เว้นจังหวะ

    print(f"เสร็จสิ้น: ส่งทั้งหมด {sent} รายการ")


if __name__ == "__main__":
    main()