import base64 #แปลงbytesเป็นbase64ไว้ใช้กับX-Line-Signature
import hashlib #โมดูลสำหรับคำนวณHMAC-SHA256
import hmac #โมดูลสำหรับคำนวณ HMAC(Hash-based Message Authentication Code)
import os 
import requests 
from fastapi import APIRouter, Request, HTTPException, Header 

from pathlib import Path 
from dotenv import load_dotenv
from datetime import datetime
from sqlalchemy import text 
from database.database import SessionLocal

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)
router = APIRouter()

LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET")
LINE_CHANNEL_ACCESS_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN")

def verify_line_signature(body: bytes, signature: str) -> bool:#ตรวจสอบว่าrequestมาจากLINE
    #เทียบX-Line-SignatureกับHMAC-SHA256ที่คำนวณเองจากChannelSecret
    if not LINE_CHANNEL_SECRET:
        return False
    digest = hmac.new(
        LINE_CHANNEL_SECRET.encode("utf-8"),
        body,
        hashlib.sha256, #HMAC-SHA256
    ).digest()
    expected_signature = base64.b64encode(digest).decode("utf-8")#แปลงเป็นbase64
    return hmac.compare_digest(expected_signature, signature)
    #เทียบsignatureที่คำนวณเองกับX-Line-Signatureที่ส่งมา

def reply_message(reply_token: str, text_message: str):
    if not reply_token:#ถ้าtokenหมดจะไม่ส่ง
        return
    
    headers = { 
        "Content-Type": "application/json", #ส่งเป็นjson
        "Authorization": f"Bearer {LINE_CHANNEL_ACCESS_TOKEN}",#ยืนยันตัว
    }
    payload = {
        "replyToken": reply_token,
        "messages": [{"type": "text", "text": text_message}],
    }
    try:
        resp = requests.post( #ส่งไปendpointของLINE 
            "https://api.line.me/v2/bot/message/reply",
            headers=headers, json=payload, timeout=5,
        )
        if resp.status_code != 200: #tokenหมด,เกินlimit,channel access tokenผิด
            print(f"[LINE Reply Error] {resp.status_code}: {resp.text}")
    except requests.RequestException as e:#network/timeout error ตอนเรียก API
        print(f"[LINE Reply Exception] {e}")

def send_line_push(line_user_id: str, text_message: str):
    #ส่งpushข้อความหาuserผ่านLINE Messaging API(เฉพาะalert,เหมือนreply_messageแต่ส่งได้ตลอด)
    if not line_user_id:#เช็คผูกบัญชี
        return

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LINE_CHANNEL_ACCESS_TOKEN}",
    }
    payload = {
        "to": line_user_id,
        "messages": [{"type": "text", "text": text_message}],
    }
    try:
        resp = requests.post(
            "https://api.line.me/v2/bot/message/push",
            headers=headers, json=payload, timeout=5,
        )
        if resp.status_code != 200:
            print(f"[LINE Push Error] {resp.status_code}: {resp.text}")
    except requests.RequestException as e:
        print(f"[LINE Push Exception] {e}")

def handle_follow_event(event: dict):
    #กดแอด
    reply_token = event.get("replyToken")
    reply_message(
        reply_token,
        "กรุณาพิมพ์รหัส 6 หลักที่ได้รับจากระบบ " \
        "เพื่อผูกบัญชี LINE ของคุณเข้ากับระบบ Smart Energy Monitoring",
    )

def handle_message_event(event: dict): 
    #userพิมพ์รหัส6หลัก
    message = event.get("message", {})#ดึงข้อความจากuser
    if message.get("type") != "text":#เช็คว่าเป็นtext
        return  
    
    reply_token = event.get("replyToken")
    line_user_id = event.get("source", {}).get("userId")#ดึงline_user_idของuser
    user_text = message.get("text", "").strip()#ตัดspaceหน้าหลังด้วยstrip

    if not (user_text.isdigit() and len(user_text) == 6):#เช็คเลขล้วน 6หลัก
        reply_message(reply_token, "กรุณาพิมพ์รหัส 6 หลักที่ได้รับจากระบบให้ถูกต้อง")
        return

    db = SessionLocal()
    try:
        row = db.execute(#ตรวจสอบรหัส6หลักแล้วเช็คกับที่userพิมพ์มา
            text("""
                SELECT user_id, line_link_code_expires_at
                FROM users
                WHERE line_link_code = :code
            """),
            {"code": user_text},
        ).mappings().first()

        #ถ้าไม่เจอรหัส6หลัก
        if not row:
            reply_message(reply_token, "ไม่พบรหัสนี้ในระบบ กรุณาตรวจสอบรหัสอีกครั้งครับ")
            return
        
        #ถ้าเจอรหัส6หลักแต่หมดอายุ
        if row["line_link_code_expires_at"] is None or row["line_link_code_expires_at"] < datetime.now():
            reply_message(reply_token, "รหัสนี้หมดอายุแล้ว กรุณาขอรหัสใหม่จากแอปครับ")
            return
    
        db.execute( #จดdatabase
            text("""
                UPDATE users
                SET line_user_id = :line_user_id,
                    line_link_code = NULL,
                    line_link_code_expires_at = NULL
                WHERE user_id = :user_id
            """),
            {"line_user_id": line_user_id, "user_id": row["user_id"]},
        )
        db.commit()#บันทึก

        reply_message(reply_token, 
        "ผูกบัญชี LINE สำเร็จแล้ว\n" \
        "ต่อไปนี้คุณจะได้รับแจ้งเตือนผ่าน LINE เมื่อพบความผิดปกติหรือค่าไฟเกินงบ")

    except Exception as e:
        db.rollback()
        print(f"[LINE Link Error] {e}")
        reply_message(reply_token, "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง")
    finally:
        db.close()

@router.post("/webhook/line")
async def line_webhook(request: Request, x_line_signature: str = Header(None)): 
    body = await request.body()  # ต้องอ่านเป็น raw bytes

    if not x_line_signature:  #เช็คส่ง header X-Line-Signature มามั้ย
        raise HTTPException(status_code=400, detail="ไม่เจอ X-Line-Signature header")

    if not verify_line_signature(body, x_line_signature): #ถ้าไม่ตรงกับ = Requestไม่ได้มาจากLINE
        raise HTTPException(status_code=403, detail="signature ไม่ถูกต้อง")


    payload = await request.json() #แปลงraw bytes เป็น JSON
    events = payload.get("events", []) #ดึงlistของeventที่ส่งมาจาก LINEwebhook
    
    for event in events: 
        event_type = event.get("type")  #ดึงtypeของevent = follow,message,unfollow,join,leave,postback
        print(f"[LINE Webhook] event type = {event_type}")

        if event_type == "follow":  #เช็คuser แอด
            handle_follow_event(event) #ส่งข้อความทักทาย
        elif event_type == "message": #userพิมพ์6หลัก
            handle_message_event(event) #ส่งข้อความตอบสำหรับผูกบัญชี

    return {"status": "ok"}