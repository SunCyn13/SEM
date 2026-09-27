from pydantic import BaseModel, EmailStr, Field, model_validator
from datetime import datetime
from decimal import Decimal #ทศนิยม
from enum import Enum #ตัวแปรคงที่
from typing import Optional #ค่าสามารถเป็นNoneได้

class UserRole(str, Enum):
    user = "user"
    admin = "admin"

class LocationMode(str, Enum):
    address = "address"
    pin = "pin"

class MeterStatus(str, Enum):
    active = "active"
    inactive = "inactive"
    maintenance = "maintenance"

class AlertType(str, Enum):
    anomaly_spike = "anomaly_spike"
    over_budget = "over_budget"
    device_fault = "device_fault"
    other = "other"

class AlertSeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"

#1.Users
class UserBase(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    address: str
    province: str
    monthly_budget: Optional[Decimal] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=72)
    phone: str = Field(..., pattern=r"^\d{10}$", description="ต้องเป็นตัวเลข 10 หลัก")

class UserResponse(UserBase):
    user_id: int
    role: UserRole
    line_linked: bool = False
    province: Optional[str] = None
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    formatted_address: Optional[str] = None
    location_source: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class LoginResponse(BaseModel):
    user_id: int
    full_name: str
    role: str
    line_linked: bool

class LineLinkCodeResponse(BaseModel):
    user_id: int
    line_link_code: str
    line_link_code_expires_at: datetime

class LineUnlinkResponse(BaseModel):
    user_id: int
    message: str

class LocationUpdate(BaseModel):
    mode: LocationMode
    address: Optional[str] = None       # mode = "address"
    latitude: Optional[Decimal] = None  # mode = "pin"
    longitude: Optional[Decimal] = None # mode = "pin"

    @model_validator(mode="after") 
    def check_fields_match_mode(self):
        if self.mode == LocationMode.address:
            if not self.address:
                raise ValueError("mode='address' ต้องระบุ address")
        elif self.mode == LocationMode.pin:
            if self.latitude is None or self.longitude is None:
                raise ValueError("mode='pin' ต้องระบุ latitude และ longitude")
        return self

#2.Meters
class MeterCreate(BaseModel):
    user_id: int
    meter_serial: str
    location: Optional[str] = None
    device_type: Optional[str] = None
    status: MeterStatus = MeterStatus.active

class MeterResponse(MeterCreate):
    meter_id: int
    installed_at: datetime

#3.Energy Readings
class EnergyReadingCreate(BaseModel):
    user_id: int
    meter_id: int
    timestamp: datetime
    kwh: Decimal
    voltage: Decimal
    current: Decimal
    cost: Decimal

class EnergyReadingResponse(EnergyReadingCreate):
    reading_id: int
    created_at: datetime


#4.Alerts
class AlertCreate(BaseModel):
    user_id: int
    meter_id: int
    alert_type: AlertType
    message: str
    severity: AlertSeverity = AlertSeverity.medium
    is_resolved: bool = False

class AlertResponse(AlertCreate):
    alert_id: int
    created_at: datetime