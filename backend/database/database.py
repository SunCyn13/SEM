import os
from pathlib import Path
from dotenv import load_dotenv

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

env_path = Path(__file__).resolve().parent.parent / ".env"

if env_path.exists():
    load_dotenv(dotenv_path=env_path)
    print("Succeed:.env(database)")
else:
    print(f"Error: ไม่เจอไฟล์ .env(database)'{env_path}'")
    
load_dotenv(dotenv_path=env_path) 

DATABASE_URL = (    #dialect+driver://user:password@host:port/dbname
    f"mysql+pymysql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
    f"@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
)

engine = create_engine(DATABASE_URL, echo=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False) 
#flushดันข้อมูลก่อนquery,commitยืนยันการบันทึกอัตโนมัติ
Base = declarative_base()