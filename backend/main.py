import random #สุ่มline
import re
from datetime import datetime, timedelta #เวลาหมดอายุ
import calendar
from decimal import Decimal

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from services.line_webhook import router as line_router, send_line_push
from services.google_maps import search_place_text, reverse_geocode, GoogleMapsError
from database.database import SessionLocal
from schemas import (
    UserCreate, UserResponse,
    LoginRequest, LoginResponse,
    MeterCreate, MeterResponse,
    EnergyReadingCreate, EnergyReadingResponse,
    AlertCreate, AlertResponse,
    LineLinkCodeResponse,
    LineUnlinkResponse,
    LocationUpdate, LocationMode,
    BillPredictionResponse,
    BudgetUpdate,
)

app = FastAPI(title="Smart Energy Monitoring API")

# อนุญาตให้ React Vite เรียก API ได้
app.add_middleware(
    CORSMiddleware, #ตรวจสอบ Request
    allow_origins=["*"],    #โดเมน
    allow_methods=["*"],    
    allow_headers=["*"],
)

app.include_router(line_router)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
def _with_line_linked(row):
    """SELECT * ไม่มีคอลัมน์ line_linked -> คำนวณจาก line_user_id"""
    if row is None:
        return None
    d = dict(row)
    d["line_linked"] = bool(d.get("line_user_id"))
    return d


def _friendly_db_error(e: Exception) -> str:
    """
    แปลง exception จาก DB ให้เป็นข้อความที่เข้าใจง่ายขึ้น แทนที่จะโชว์ raw SQL error
    หรือ hardcode ข้อความเดียวไม่ว่าสาเหตุจะเป็นอะไร (เดิม create_meter เคย hardcode
    "รหัสมิเตอร์อาจซ้ำ" ทั้งที่บางครั้งสาเหตุจริงคือ user_id/meter_id ที่กรอกไม่มีอยู่จริง)
    """
    msg = str(e)
    lower = msg.lower()
    if "foreign key constraint fails" in lower:
        return "ไม่พบ user_id หรือ meter_id ที่ระบุในระบบ กรุณาตรวจสอบว่ามี user/meter นี้อยู่จริง"
    if "duplicate entry" in lower:
        return "ข้อมูลนี้มีอยู่แล้วในระบบ (รหัสซ้ำกับที่มีอยู่แล้ว)"
    return msg


#1.Users

@app.post("/users", response_model=UserResponse)
def create_user(user: UserCreate):
    db: Session = SessionLocal()
    try:
        data = user.model_dump()
        result = db.execute(
            text("""
                INSERT INTO users (full_name, email, password, phone, address, province, monthly_budget)
                VALUES (:full_name, :email, :password, :phone, :address, :province, :monthly_budget)
            """),
            data,
        )
        db.commit()
        new_id = result.lastrowid
        row = db.execute(
            text("SELECT * FROM users WHERE user_id = :id"), {"id": new_id}
        ).mappings().first()
        return _with_line_linked(row)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=_friendly_db_error(e))
    finally:
        db.close()

@app.post("/login", response_model=LoginResponse)
def login(body: LoginRequest):
    db: Session = SessionLocal()
    try:
        row = db.execute(
            text("""SELECT user_id, full_name, password, role, line_user_id
                    FROM users WHERE email = :email"""),
            {"email": body.email},
        ).mappings().first()
        if not row or row["password"] != body.password:
            raise HTTPException(status_code=401, detail="อีเมลหรือรหัสผ่านไม่ถูกต้อง")
        return {
            "user_id": row["user_id"],
            "full_name": row["full_name"],
            "role": row["role"],
            "line_linked": bool(row["line_user_id"]),
        }
    finally:
        db.close()

@app.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: int):
    db: Session = SessionLocal()
    try:
        row = db.execute(
            text("SELECT * FROM users WHERE user_id = :id"), {"id": user_id}
        ).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้นี้")
        return _with_line_linked(row)
    finally:
        db.close()


@app.post("/users/{user_id}/line/link-code", response_model=LineLinkCodeResponse)
def generate_line_link_code(user_id: int):
    db: Session = SessionLocal()
    try:
        #เช็ค user_id 
        user_row = db.execute(
            text("SELECT user_id FROM users WHERE user_id = :id"), {"id": user_id}
        ).mappings().first()
        if not user_row:
            raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้นี้")

        #code 6 หลัก หมดอายุ 5 นาที
        code = f"{random.randint(0, 999999):06d}"
        expires_at = datetime.now() + timedelta(minutes=5)

        db.execute(
            text("""
                UPDATE users
                SET line_link_code = :code,
                    line_link_code_expires_at = :expires_at
                WHERE user_id = :user_id
            """),
            {"code": code, "expires_at": expires_at, "user_id": user_id},
        )
        db.commit()

        return {
            "user_id": user_id,
            "line_link_code": code,
            "line_link_code_expires_at": expires_at,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=_friendly_db_error(e))
    finally:
        db.close()

@app.post("/users/{user_id}/line/unlink", response_model=LineUnlinkResponse)
def unlink_line_account(user_id: int):
    db: Session = SessionLocal()
    try:
        # เช็คว่า user มีอยู่จริง และดึง line_user_id ปัจจุบันมาเช็คสถานะ
        user_row = db.execute(
            text("SELECT user_id, line_user_id FROM users WHERE user_id = :id"),
            {"id": user_id},
        ).mappings().first()

        if not user_row:
            raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้นี้")

        if not user_row["line_user_id"]:
            raise HTTPException(status_code=400, detail="ผู้ใช้นี้ยังไม่ได้ผูกบัญชี LINE ไว้")

        db.execute(
            text("""
                UPDATE users
                SET line_user_id = NULL,
                    line_link_code = NULL,
                    line_link_code_expires_at = NULL
                WHERE user_id = :user_id
            """),
            {"user_id": user_id},
        )
        db.commit()

        return {
            "user_id": user_id,
            "message": "ยกเลิกการผูกบัญชี LINE เรียบร้อยแล้ว",
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=_friendly_db_error(e))
    finally:
        db.close()


@app.patch("/users/{user_id}/location", response_model=UserResponse)
def update_user_location(user_id: int, location: LocationUpdate):
    #ตำแหน่งคือ core purpose ของ endpoint นี้ -> ถ้า Google Maps error ต้อง raise 400 จริงๆ ห้าม silent-fail

    db: Session = SessionLocal()
    try:
        #เช็คว่า user มีอยู่จริงก่อน ยิง Google Maps API
        user_row = db.execute(
            text("SELECT user_id FROM users WHERE user_id = :id"), {"id": user_id}
        ).mappings().first()
        if not user_row:
            raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้นี้")

        #model_validator ใน schemas.py การันตีแล้วว่า field ตรงกับ mode ที่ส่งมา
        if location.mode == LocationMode.address:
            #mode="address" -> ใช้ Places API (Text Search) แปลงที่อยู่เป็นพิกัด
            try:
                place = search_place_text(location.address)
            except GoogleMapsError as e:
                raise HTTPException(status_code=400, detail=str(e))

            latitude = place["latitude"]
            longitude = place["longitude"]
            formatted_address = place["formatted_address"]
            province = place.get("province")
            location_source = "places"  

        else:  # LocationMode.pin
            #mode="pin" ใช้พิกัดที่ user ปักหมุดมาตรงๆ แล้วเรียก Geocoding API (reverse) เพื่อได้ formatted_address
            latitude = location.latitude
            longitude = location.longitude
            try:
                geocode_result = reverse_geocode(float(latitude), float(longitude))
            except GoogleMapsError as e:
                raise HTTPException(status_code=400, detail=str(e))

            formatted_address = geocode_result["formatted_address"]
            province = geocode_result.get("province")
            location_source = "manual"  

        db.execute(
            text("""
                UPDATE users
                SET latitude = :latitude,
                    longitude = :longitude,
                    formatted_address = :formatted_address,
                    location_source = :location_source,
                    address = :formatted_address
                WHERE user_id = :user_id
            """),
            {
                "latitude": latitude,
                "longitude": longitude,
                "formatted_address": formatted_address,
                "location_source": location_source,
                "user_id": user_id,
            },
        )
        db.commit()

        row = db.execute(
            text("SELECT * FROM users WHERE user_id = :id"), {"id": user_id}
        ).mappings().first()
        return _with_line_linked(row)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=_friendly_db_error(e))
    finally:
        db.close()


@app.patch("/users/{user_id}/budget", response_model=UserResponse)
def update_user_budget(user_id: int, body: BudgetUpdate):
    db: Session = SessionLocal()
    try:
        exists = db.execute(
            text("SELECT user_id FROM users WHERE user_id = :id"), {"id": user_id}
        ).mappings().first()
        if not exists:
            raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้นี้")

        db.execute(
            text("UPDATE users SET monthly_budget = :budget WHERE user_id = :id"),
            {"budget": body.monthly_budget, "id": user_id},
        )
        db.commit()

        row = db.execute(
            text("SELECT * FROM users WHERE user_id = :id"), {"id": user_id}
        ).mappings().first()
        return _with_line_linked(row)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=_friendly_db_error(e))
    finally:
        db.close()


#2.Meters
@app.post("/meters", response_model=MeterResponse)
def create_meter(meter: MeterCreate):
    db: Session = SessionLocal()
    try:
        result = db.execute(
            text("""
                INSERT INTO meters (user_id, meter_serial, location, device_type, status)
                VALUES (:user_id, :meter_serial, :location, :device_type, :status)
            """),
            meter.model_dump(),
        )
        db.commit()
        new_id = result.lastrowid
        row = db.execute(
            text("SELECT * FROM meters WHERE meter_id = :id"), {"id": new_id}
        ).mappings().first()
        return row
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=_friendly_db_error(e))
    finally:
        db.close()


@app.get("/meters/{user_id}", response_model=list[MeterResponse])
def get_meters_by_user(user_id: int):
    db: Session = SessionLocal()
    try:
        rows = db.execute(
            text("SELECT * FROM meters WHERE user_id = :user_id"), {"user_id": user_id}
        ).mappings().all()
        return rows
    finally:
        db.close()


#3.Energy Readings

@app.post("/readings", response_model=EnergyReadingResponse)
def create_reading(reading: EnergyReadingCreate):
    db: Session = SessionLocal()
    try:
        result = db.execute(
            text("""
                INSERT INTO energy_readings
                    (user_id, meter_id, timestamp, kwh, voltage, current, cost)
                VALUES
                    (:user_id, :meter_id, :timestamp, :kwh, :voltage, :current, :cost)
            """),
            reading.model_dump(),
        )
        db.commit()
        new_id = result.lastrowid
        row = db.execute(
            text("SELECT * FROM energy_readings WHERE reading_id = :id"), {"id": new_id}
        ).mappings().first()

        # Auto-check: anomaly spike + budget threshold
        # ครอบ try/except แยก เพราะเป็นผลข้างเคียง ไม่ใช่ purpose หลักของ endpoint
        # (เหมือน pattern การส่ง LINE push ใน create_alert)
        try:
            _check_anomaly(db, reading.user_id, reading.meter_id, reading.current)
            _check_budget(db, reading.user_id, reading.meter_id)
        except Exception as e:
            print(f"[Auto Alert Check Error] {e}")

        return row
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=_friendly_db_error(e))
    finally:
        db.close()


@app.get("/readings/{user_id}", response_model=list[EnergyReadingResponse])
def get_readings_by_user(user_id: int, limit: int = 100):
    db: Session = SessionLocal()
    try:
        rows = db.execute(
            text("""
                SELECT * FROM energy_readings
                WHERE user_id = :user_id
                ORDER BY timestamp DESC
                LIMIT :limit
            """),
            {"user_id": user_id, "limit": limit},
        ).mappings().all()
        return rows
    finally:
        db.close()

@app.get("/readings/{user_id}/summary")
def get_readings_summary(user_id: int):
    db: Session = SessionLocal()
    try:
        row = db.execute(
            text("""
                SELECT COUNT(*)                AS record_count,
                       COALESCE(SUM(kwh), 0)   AS total_kwh,
                       COALESCE(SUM(cost), 0)  AS total_cost
                FROM energy_readings
                WHERE user_id = :user_id
            """),
            {"user_id": user_id},
        ).mappings().first()
        return {
            "record_count": int(row["record_count"]),
            "total_kwh": float(row["total_kwh"]),
            "total_cost": float(row["total_cost"]),
        }
    finally:
        db.close()

@app.delete("/readings/{user_id}")
def delete_readings_by_user(user_id: int, admin_id: int, meter_id: int | None = None):
    """ลบข้อมูล energy_readings ของ user (หรือเฉพาะมิเตอร์ที่ระบุ) - admin เท่านั้น"""
    db: Session = SessionLocal()
    try:
        admin = db.execute(
            text("SELECT role FROM users WHERE user_id = :id"), {"id": admin_id}
        ).mappings().first()
        if not admin or admin["role"] != "admin":
            raise HTTPException(status_code=403, detail="เฉพาะ admin เท่านั้นที่ลบข้อมูลได้")

        target = db.execute(
            text("SELECT user_id FROM users WHERE user_id = :id"), {"id": user_id}
        ).mappings().first()
        if not target:
            raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้นี้")

        if meter_id is not None:
            result = db.execute(
                text("DELETE FROM energy_readings WHERE user_id = :u AND meter_id = :m"),
                {"u": user_id, "m": meter_id},
            )
        else:
            result = db.execute(
                text("DELETE FROM energy_readings WHERE user_id = :u"),
                {"u": user_id},
            )
        db.commit()
        return {"user_id": user_id, "deleted": result.rowcount}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=_friendly_db_error(e))
    finally:
        db.close()
#4.Alerts

_SEVERITY_LABEL = {
    "low": "🟢 ต่ำ",
    "medium": "🟡 ปานกลาง",
    "high": "🔴 สูง",
}

_ALERT_TYPE_LABEL = {
    "anomaly_spike": "กระแสไฟฟ้าพุ่งสูงผิดปกติ",
    "over_budget": "ใช้งานเกินงบประมาณ",
    "device_fault": "อุปกรณ์ขัดข้อง",
    "other": "อื่นๆ",
}

@app.post("/alerts", response_model=AlertResponse)
def create_alert(alert: AlertCreate):
    db: Session = SessionLocal()
    try:
        result = db.execute(
            text("""
                INSERT INTO alerts (user_id, meter_id, alert_type, message, severity, is_resolved)
                VALUES (:user_id, :meter_id, :alert_type, :message, :severity, :is_resolved)
            """),
            alert.model_dump(),
        )
        db.commit()
        new_id = result.lastrowid
        row = db.execute(
            text("SELECT * FROM alerts WHERE alert_id = :id"), {"id": new_id}
        ).mappings().first()

        #แจ้งเตือนผ่าน LINE
        try:
            user_row = db.execute(
                text("""
                    SELECT u.line_user_id, m.meter_serial
                    FROM users u
                    LEFT JOIN meters m ON m.meter_id = :meter_id
                    WHERE u.user_id = :user_id
                """),
                {"user_id": alert.user_id, "meter_id": alert.meter_id},
            ).mappings().first()

            if user_row and user_row["line_user_id"]:
                severity_label = _SEVERITY_LABEL.get(alert.severity.value, alert.severity.value)
                type_label = _ALERT_TYPE_LABEL.get(alert.alert_type.value, alert.alert_type.value)
                meter_label = user_row["meter_serial"] or f"#{alert.meter_id}"
                push_text = (
                    f"⚠️ แจ้งเตือนระบบ Smart Energy\n"
                    f"มิเตอร์: {meter_label}\n"
                    f"ประเภท: {type_label}\n"
                    f"ระดับ: {severity_label}\n"
                    f"รายละเอียด: {alert.message}"
                )
                send_line_push(user_row["line_user_id"], push_text)
        except Exception as e:
            print(f"[LINE Push in create_alert Error] {e}")

        return row
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=_friendly_db_error(e))
    finally:
        db.close()

@app.get("/alerts/{user_id}", response_model=list[AlertResponse])
def get_alerts_by_user(user_id: int):
    db: Session = SessionLocal()
    try:
        rows = db.execute(
            text("""
                SELECT * FROM alerts
                WHERE user_id = :user_id
                ORDER BY created_at DESC, alert_id DESC
            """),
            {"user_id": user_id},
        ).mappings().all()
        return rows
    finally:
        db.close()


@app.patch("/alerts/{alert_id}/resolve", response_model=AlertResponse)
def resolve_alert(alert_id: int):
    db: Session = SessionLocal()
    try:
        row = db.execute(
            text("SELECT alert_id FROM alerts WHERE alert_id = :id"), {"id": alert_id}
        ).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="ไม่พบการแจ้งเตือนนี้")

        db.execute(
            text("UPDATE alerts SET is_resolved = TRUE WHERE alert_id = :id"),
            {"id": alert_id},
        )
        db.commit()

        return db.execute(
            text("SELECT * FROM alerts WHERE alert_id = :id"), {"id": alert_id}
        ).mappings().first()
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=_friendly_db_error(e))
    finally:
        db.close()

#5.Bill Prediction
@app.get("/users/{user_id}/bill-prediction", response_model=BillPredictionResponse)
def get_bill_prediction(user_id: int):
    db: Session = SessionLocal()
    try:
        user_row = db.execute(
            text("SELECT monthly_budget FROM users WHERE user_id = :id"), {"id": user_id}
        ).mappings().first()
        if not user_row:
            raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้นี้")

        now = datetime.now()
        month_start = _month_start(now)
        days_in_month = calendar.monthrange(now.year, now.month)[1]
        days_elapsed = max(1, now.day)

        total_row = db.execute(
            text("""
                SELECT COALESCE(SUM(cost), 0) AS total
                FROM energy_readings
                WHERE user_id = :user_id AND timestamp >= :month_start
            """),
            {"user_id": user_id, "month_start": month_start},
        ).mappings().first()
        month_to_date_cost = Decimal(str(total_row["total"]))

        avg_per_day = month_to_date_cost / days_elapsed
        predicted_total = avg_per_day * days_in_month

        return {
            "user_id": user_id,
            "month_to_date_cost": month_to_date_cost,
            "days_elapsed": days_elapsed,
            "days_in_month": days_in_month,
            "avg_cost_per_day": avg_per_day,
            "predicted_total_cost": predicted_total,
            "monthly_budget": user_row["monthly_budget"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=_friendly_db_error(e))
    finally:
        db.close()



# Thresholds ของmeter 
HIGH_LOAD_A = 16          # ให้ตรงกับ threshold ที่หน้า Meters.jsx ใช้ตัดสิน "High Load"
BUDGET_NEAR_RATIO = 0.8   # แจ้งเตือนเมื่อถึง 80% ของงบ


def _month_start(dt: datetime) -> datetime:
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _insert_alert(db: Session, user_id: int, meter_id: int, alert_type: str, message: str, severity: str):
    """สร้าง alert record + ส่ง LINE push — ใช้ร่วมกันจาก auto-check (anomaly/budget)"""
    result = db.execute(
        text("""
            INSERT INTO alerts (user_id, meter_id, alert_type, message, severity, is_resolved)
            VALUES (:user_id, :meter_id, :alert_type, :message, :severity, FALSE)
        """),
        {"user_id": user_id, "meter_id": meter_id, "alert_type": alert_type,
         "message": message, "severity": severity},
    )
    db.commit()

    try:
        user_row = db.execute(
            text("SELECT line_user_id FROM users WHERE user_id = :id"), {"id": user_id}
        ).mappings().first()
        if user_row and user_row["line_user_id"]:
            severity_label = _SEVERITY_LABEL.get(severity, severity)
            push_text = f"⚠️ แจ้งเตือนระบบ Smart Energy\nระดับ: {severity_label}\nรายละเอียด: {message}"
            send_line_push(user_row["line_user_id"], push_text)
    except Exception as e:
        print(f"[LINE Push Error - auto alert] {e}")

    return result.lastrowid


def _check_anomaly(db: Session, user_id: int, meter_id: int, current: Decimal):
    """Threshold แบบง่าย: current เกิน HIGH_LOAD_A -> สร้าง anomaly_spike
    กันสแปม: ถ้ามี anomaly_spike ที่ยัง unresolved ของมิเตอร์นี้อยู่แล้ว ไม่สร้างซ้ำ"""
    amp = float(current)
    if amp < HIGH_LOAD_A:
        return

    existing = db.execute(
        text("""
            SELECT alert_id FROM alerts
            WHERE meter_id = :meter_id AND alert_type = 'anomaly_spike' AND is_resolved = FALSE
            LIMIT 1
        """),
        {"meter_id": meter_id},
    ).mappings().first()
    if existing:
        return

    severity = "high" if amp >= HIGH_LOAD_A * 1.5 else "medium"
    message = f"ตรวจพบกระแสไฟฟ้าพุ่งสูงผิดปกติ ({amp:.2f} A) อาจเกิดจากไฟรั่วหรืออุปกรณ์ขัดข้อง"
    _insert_alert(db, user_id, meter_id, "anomaly_spike", message, severity)


def _check_budget(db: Session, user_id: int, meter_id: int):
    """เทียบค่าไฟสะสมเดือนนี้กับ monthly_budget -> over_budget ที่ 80% (medium) / 100% (high)
    กันสแปม: เช็คว่ามี alert ระดับเดียวกันของเดือนนี้ที่สร้างไปแล้วหรือยัง"""
    user_row = db.execute(
        text("SELECT monthly_budget FROM users WHERE user_id = :id"), {"id": user_id}
    ).mappings().first()
    if not user_row or user_row["monthly_budget"] is None:
        return

    budget = float(user_row["monthly_budget"])
    if budget <= 0:
        return

    month_start = _month_start(datetime.now())
    total_row = db.execute(
        text("""
            SELECT COALESCE(SUM(cost), 0) AS total
            FROM energy_readings
            WHERE user_id = :user_id AND timestamp >= :month_start
        """),
        {"user_id": user_id, "month_start": month_start},
    ).mappings().first()
    total_cost = float(total_row["total"])

    if total_cost >= budget:
        severity = "high"
        message = f"ค่าไฟฟ้าเดือนนี้ ({total_cost:.2f} บาท) เกินงบที่ตั้งไว้ ({budget:.2f} บาท) แล้ว"
    elif total_cost >= budget * BUDGET_NEAR_RATIO:
        severity = "medium"
        message = f"ค่าไฟฟ้าเดือนนี้ ({total_cost:.2f} บาท) ใกล้ถึงงบที่ตั้งไว้ ({budget:.2f} บาท) แล้ว (80%+)"
    else:
        return

    existing = db.execute(
        text("""
            SELECT alert_id FROM alerts
            WHERE user_id = :user_id AND alert_type = 'over_budget'
              AND severity = :severity AND created_at >= :month_start
            LIMIT 1
        """),
        {"user_id": user_id, "severity": severity, "month_start": month_start},
    ).mappings().first()
    if existing:
        return

    _insert_alert(db, user_id, meter_id, "over_budget", message, severity)


#6.Admin Overview
def _province_from_address(addr):
    """ดึงจังหวัดจาก formatted_address (รูปแบบอังกฤษ: '..., Nakhon Pathom, Thailand')"""
    if not addr:
        return None
    parts = [p.strip() for p in addr.split(",")]
    if len(parts) < 2 or parts[-1].lower() != "thailand":
        return None
    province = re.sub(r"\d+", "", parts[-2]).strip()
    return province or None


@app.get("/admin/overview")
def admin_overview(admin_id: int):
    db: Session = SessionLocal()
    try:
        # เช็ก role ที่ฝั่ง backend (ไม่เชื่อ frontend อย่างเดียว)
        admin = db.execute(
            text("SELECT role FROM users WHERE user_id = :id"), {"id": admin_id}
        ).mappings().first()
        if not admin or admin["role"] != "admin":
            raise HTTPException(status_code=403, detail="เฉพาะผู้ดูแลระบบเท่านั้น")

        month_start = _month_start(datetime.now())
        rows = db.execute(
            text("""
                SELECT u.user_id, u.full_name, u.email, u.latitude, u.longitude,
                       u.formatted_address, u.monthly_budget,
                       (SELECT COUNT(*) FROM meters m
                         WHERE m.user_id = u.user_id) AS meter_count,
                       (SELECT COUNT(*) FROM alerts a
                         WHERE a.user_id = u.user_id AND a.is_resolved = FALSE) AS open_alerts,
                       (SELECT COALESCE(SUM(r.kwh), 0) FROM energy_readings r
                         WHERE r.user_id = u.user_id AND r.timestamp >= :ms) AS month_kwh,
                       (SELECT COALESCE(SUM(r.cost), 0) FROM energy_readings r
                         WHERE r.user_id = u.user_id AND r.timestamp >= :ms) AS month_cost
                FROM users u
                ORDER BY open_alerts DESC, month_cost DESC
            """),
            {"ms": month_start},
        ).mappings().all()

        users = []
        by_province = {}
        for r in rows:
            province = _province_from_address(r["formatted_address"]) or "ไม่ระบุ"
            item = {
                "user_id": r["user_id"],
                "full_name": r["full_name"],
                "email": r["email"],
                "latitude": float(r["latitude"]) if r["latitude"] is not None else None,
                "longitude": float(r["longitude"]) if r["longitude"] is not None else None,
                "formatted_address": r["formatted_address"],
                "province": province,
                "monthly_budget": float(r["monthly_budget"]) if r["monthly_budget"] is not None else None,
                "meter_count": int(r["meter_count"]),
                "open_alerts": int(r["open_alerts"]),
                "month_kwh": float(r["month_kwh"]),
                "month_cost": float(r["month_cost"]),
            }
            users.append(item)

            p = by_province.setdefault(
                province,
                {"province": province, "users": 0, "month_kwh": 0.0, "month_cost": 0.0, "open_alerts": 0},
            )
            p["users"] += 1
            p["month_kwh"] += item["month_kwh"]
            p["month_cost"] += item["month_cost"]
            p["open_alerts"] += item["open_alerts"]

        return {
            "totals": {
                "users": len(users),
                "meters": sum(u["meter_count"] for u in users),
                "open_alerts": sum(u["open_alerts"] for u in users),
                "month_kwh": sum(u["month_kwh"] for u in users),
                "month_cost": sum(u["month_cost"] for u in users),
            },
            "provinces": sorted(by_province.values(), key=lambda p: p["month_cost"], reverse=True),
            "users": users,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=_friendly_db_error(e))
    finally:
        db.close()
