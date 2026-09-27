import random #สุ่มline
from datetime import datetime, timedelta #เวลาหมดอายุ

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
    LocationUpdate, LocationMode
    
)

app = FastAPI(title="Smart Energy Monitoring API")

# อนุญาตให้ frontend (React บน Vite) เรียก API ได้
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
        raise HTTPException(status_code=400, detail=str(e))
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
        raise HTTPException(status_code=400, detail=str(e))
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
        raise HTTPException(status_code=400, detail=str(e))
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
                    address = :formatted_address,
                WHERE user_id = :user_id
            """),
            {
                "latitude": latitude,
                "longitude": longitude,
                "formatted_address": formatted_address,
                "location_source": location_source,
                "province": province,
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
        raise HTTPException(status_code=400, detail=str(e))
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
        raise HTTPException(status_code=400, detail=str(e))
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
        return row
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
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


#4.Alerts

_SEVERITY_LABEL = {
    "low": "🟢 ต่ำ",
    "medium": "🟡 ปานกลาง",
    "high": "🔴 สูง",
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
        db.commit()#เอาidไปสร้างlogแจ้งเตือน
        new_id = result.lastrowid 
        row = db.execute(
            text("SELECT * FROM alerts WHERE alert_id = :id"), {"id": new_id}
        ).mappings().first()

        #แจ้งเตือนผ่าน LINE
        try:
            user_row = db.execute(
                text("SELECT line_user_id FROM users WHERE user_id = :id"),
                {"id": alert.user_id},
            ).mappings().first()

            if user_row and user_row["line_user_id"]:
                severity_label = _SEVERITY_LABEL.get(alert.severity.value, alert.severity.value)
                push_text = (
                    f"⚠️ แจ้งเตือนระบบ Smart Energy\n"
                    f"ระดับ: {severity_label}\n"
                    f"รายละเอียด: {alert.message}"
                )
                send_line_push(user_row["line_user_id"], push_text)
        except Exception as e:
            print(f"[LINE Push in create_alert Error] {e}")

        return row
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
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
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()