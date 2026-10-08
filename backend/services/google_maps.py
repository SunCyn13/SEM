import os
import requests
from pathlib import Path
from dotenv import load_dotenv


env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

def _province_from_geocoding(components: list):
    """Geocoding API: หา administrative_area_level_1 (จังหวัด) จาก address_components"""
    for c in components:
        if "administrative_area_level_1" in c.get("types", []):
            return c.get("long_name")
    return None


def _province_from_places(components: list):
    """Places API (New): field ชื่อ addressComponents / longText"""
    for c in components:
        if "administrative_area_level_1" in c.get("types", []):
            return c.get("longText")
    return None

class GoogleMapsError(Exception):
    """
    Exception เฉพาะของ Google Maps service
    ไม่ silent-fail เพราะ location คือ core purpose ของ endpoint ที่เรียกใช้
    endpoint ฝั่ง main.py ควรจับ exception นี้แล้ว raise HTTPException(status_code=400, ...) ต่อ
    """
    pass


def search_place_text(query: str) -> dict:
    """
    ค้นหาสถานที่จากข้อความ (เช่น ที่อยู่ / ชื่อสถานที่) ด้วย Places API (New) - Text Search
    ใช้ตอน mode = "address" ใน LocationUpdate schema

    คืนค่า dict: {"latitude": float, "longitude": float, "formatted_address": str}
    """
    if not GOOGLE_API_KEY:
        raise GoogleMapsError("ไม่พบ GOOGLE_API_KEY ใน .env")

    if not query or not query.strip():
        raise GoogleMapsError("query สำหรับค้นหาสถานที่ต้องไม่ว่าง")

    url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        #FieldMask จำกัด field ที่ขอกลับมา ลดค่าใช้จ่าย/ปริมาณข้อมูล
        "X-Goog-FieldMask": "places.location,places.formattedAddress",
    }
    payload = {"textQuery": query}

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=5)
    except requests.RequestException as e:
        #network/timeout error ตอนเรียก API
        raise GoogleMapsError(f"เรียก Places API ไม่สำเร็จ: {e}")

    if resp.status_code != 200:
        #Googleตอบกลับerror APIkeyผิด,quotaเกิน
        raise GoogleMapsError(f"Places API error {resp.status_code}: {resp.text}")

    data = resp.json()
    places = data.get("places", [])
    if not places:
        #ค้นหาสำเร็จ แต่ไม่เจอสถานที่ตรงกับ query
        raise GoogleMapsError(f"ไม่พบสถานที่จาก query: {query}")

    place = places[0]  #เอาผลลัพธ์อันดับแรกที่ตรงที่สุด
    location = place.get("location", {})
    latitude = location.get("latitude")
    longitude = location.get("longitude")
    formatted_address = place.get("formattedAddress")

    if latitude is None or longitude is None:
        raise GoogleMapsError("Places API ไม่ส่งพิกัดกลับมา")

    return {
        "latitude": latitude,
        "longitude": longitude,
        "formatted_address": formatted_address,
    }


def reverse_geocode(latitude: float, longitude: float) -> dict:
    """
    แปลงพิกัด (lat, lng) กลับเป็นที่อยู่ ด้วย Geocoding API
    ใช้ตอน mode = "pin" ใน LocationUpdate schema
    คืนค่า dict: {"formatted_address": str}
    """
    if not GOOGLE_API_KEY:
        raise GoogleMapsError("ไม่พบ GOOGLE_API_KEY ใน .env")

    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {
        "latlng": f"{latitude},{longitude}",
        "key": GOOGLE_API_KEY,
    }

    try:
        resp = requests.get(url, params=params, timeout=5)
    except requests.RequestException as e:
        raise GoogleMapsError(f"เรียก Geocoding API ไม่สำเร็จ: {e}")

    if resp.status_code != 200:
        raise GoogleMapsError(f"Geocoding API error {resp.status_code}: {resp.text}")

    data = resp.json()
    status = data.get("status")
    if status != "OK":
        #status อื่นๆ เช่น ZERO_RESULTS, OVER_QUERY_LIMIT, REQUEST_DENIED
        raise GoogleMapsError(f"Geocoding API status: {status}")

    results = data.get("results", [])
    if not results:
        raise GoogleMapsError(f"ไม่พบที่อยู่จากพิกัด: {latitude}, {longitude}")

    first = results[0]

    # ผลลัพธ์แรกอาจเป็น plus code ที่ไม่มีจังหวัด จึงวนหาในทุกผลลัพธ์
    province = None
    for r in results:
        province = _province_from_geocoding(r.get("address_components", []))
        if province:
            break

    return {
        "formatted_address": first.get("formatted_address"),
        "province": province,
    }