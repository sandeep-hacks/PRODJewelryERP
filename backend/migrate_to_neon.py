"""
Optional helper script to copy existing data from local SQLite (jewellery_erp.db) to Neon PostgreSQL.
Run only if you had local data in SQLite you want to migrate to Neon:
    python migrate_to_neon.py
"""
import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Load environment
load_dotenv()

SQLITE_PATH = os.path.abspath("jewellery_erp.db")
if not os.path.exists(SQLITE_PATH):
    print(f"No SQLite database found at {SQLITE_PATH}. Nothing to migrate.")
    sys.exit(0)

NEON_URL = os.getenv("DATABASE_URL")
if not NEON_URL or NEON_URL.startswith("sqlite"):
    print("Please set your Neon PostgreSQL DATABASE_URL in backend/.env before running migration.")
    sys.exit(1)

# Format driver for psycopg v3
if NEON_URL.startswith("postgres://"):
    NEON_URL = NEON_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif NEON_URL.startswith("postgresql://") and "+psycopg" not in NEON_URL:
    NEON_URL = NEON_URL.replace("postgresql://", "postgresql+psycopg://", 1)

print(f"Connecting to SQLite: {SQLITE_PATH}")
print("Connecting to Neon PostgreSQL...")

sqlite_engine = create_engine(f"sqlite:///{SQLITE_PATH}")
neon_engine = create_engine(NEON_URL, pool_pre_ping=True)

from app.models import Base, Admin, Customer, JewelleryItem, GoldRate, Bill, BillItem

# Ensure tables exist in Neon
Base.metadata.create_all(bind=neon_engine)

SqliteSession = sessionmaker(bind=sqlite_engine)
NeonSession = sessionmaker(bind=neon_engine)

sqlite_db = SqliteSession()
neon_db = NeonSession()

try:
    # 1. Customers
    customers = sqlite_db.query(Customer).all()
    for c in customers:
        if not neon_db.query(Customer).filter_by(id=c.id).first():
            neon_db.merge(c)
    print(f"Migrated {len(customers)} customers.")

    # 2. Jewellery Items
    items = sqlite_db.query(JewelleryItem).all()
    for item in items:
        if not neon_db.query(JewelleryItem).filter_by(id=item.id).first():
            neon_db.merge(item)
    print(f"Migrated {len(items)} inventory items.")

    # 3. Gold Rates
    rates = sqlite_db.query(GoldRate).all()
    for r in rates:
        if not neon_db.query(GoldRate).filter_by(id=r.id).first():
            neon_db.merge(r)
    print(f"Migrated {len(rates)} gold rate records.")

    # 4. Bills & BillItems
    bills = sqlite_db.query(Bill).all()
    for b in bills:
        if not neon_db.query(Bill).filter_by(id=b.id).first():
            neon_db.merge(b)
    print(f"Migrated {len(bills)} bills.")

    neon_db.commit()
    print("✅ All existing SQLite data has been migrated to Neon PostgreSQL successfully!")
except Exception as e:
    neon_db.rollback()
    print(f"❌ Error during migration: {e}")
finally:
    sqlite_db.close()
    neon_db.close()
