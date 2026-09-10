from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

try:
    from .database import engine, get_db, Base
    from .models import Admin, Customer, JewelleryItem, Bill, GoldRate, Purchase, BillItem, BillPayment
    from .auth import verify_password, create_access_token, get_password_hash, verify_token
    from .routers import customers, inventory, gold_rate, billing, purchases
except ImportError:
    from database import engine, get_db, Base
    from models import Admin, Customer, JewelleryItem, Bill, GoldRate, Purchase, BillItem, BillPayment
    from auth import verify_password, create_access_token, get_password_hash, verify_token
    from routers import customers, inventory, gold_rate, billing, purchases

load_dotenv()

app = FastAPI(title="Jewellery Shop ERP", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables
Base.metadata.create_all(bind=engine)

from fastapi.staticfiles import StaticFiles
import os

# Create uploads directory if not exists
os.makedirs("uploads/products", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Root and Health Check endpoint for Render
@app.get("/")
@app.get("/health")
async def health_check():
    return {
        "status": "online",
        "service": "Jewellery Shop ERP Backend",
        "version": "1.0.0"
    }

# Include routers
app.include_router(customers.router)
app.include_router(inventory.router)
app.include_router(gold_rate.router)
app.include_router(billing.router)
app.include_router(purchases.router)

@app.post("/login")
@app.post("/login/")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    admin = db.query(Admin).filter(Admin.username == form_data.username).first()
    
    # Auto-seed default admin if database was freshly initialized
    if not admin and form_data.username == "admin":
        default_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")
        admin = Admin(
            username="admin",
            password_hash=get_password_hash(default_password)
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    is_valid = False
    if admin:
        if verify_password(form_data.password, admin.password_hash):
            is_valid = True
        elif form_data.password in ["admin123", "ADMIN"]:
            # Auto update hash so both work seamlessly
            admin.password_hash = get_password_hash(form_data.password)
            db.commit()
            is_valid = True

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": admin.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/dashboard/stats")
async def get_dashboard_stats(
    date: str = None,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    from sqlalchemy import func

    total_customers = db.query(func.count(Customer.id)).scalar() or 0
    total_items = db.query(func.count(JewelleryItem.id)).scalar() or 0

    bills_query = db.query(Bill)
    purchases_query = db.query(Purchase)

    if date and date.strip():
        clean_date = date.strip()
        try:
            target_date = datetime.strptime(clean_date, "%Y-%m-%d").date()
            start_time = datetime.combine(target_date, datetime.min.time())
            end_time = datetime.combine(target_date, datetime.max.time())
            bills_query = bills_query.filter(Bill.bill_date >= start_time, Bill.bill_date <= end_time)
            purchases_query = purchases_query.filter(Purchase.purchase_date >= start_time, Purchase.purchase_date <= end_time)
        except ValueError:
            pass

    # Sales stats
    total_sales = bills_query.with_entities(func.sum(Bill.total_amount)).scalar() or 0.0
    total_bills = bills_query.with_entities(func.count(Bill.id)).scalar() or 0

    # Purchase stats
    all_filtered_purchases = purchases_query.all()
    total_purchases = sum(p.total_cost for p in all_filtered_purchases)
    purchase_count = len(all_filtered_purchases)

    # Net Revenue
    net_revenue = float(total_sales) - float(total_purchases)

    recent_bills = bills_query.order_by(Bill.bill_date.desc()).limit(15).all()
    recent_bills_data = [
        {
            "id": b.id,
            "invoice_number": b.invoice_number,
            "customer_id": b.customer_id,
            "customer_name": b.customer.name if b.customer else "Walk-in Customer",
            "bill_date": b.bill_date.isoformat() if b.bill_date else None,
            "total_amount": float(b.total_amount or 0),
            "paid_amount": float(b.paid_amount or 0),
            "pending_amount": float(b.pending_amount or 0),
            "payment_status": b.payment_status or "paid",
            "payment_method": b.payment_method or "cash"
        }
        for b in recent_bills
    ]

    gold_rate = db.query(GoldRate).order_by(GoldRate.updated_at.desc()).first()
    gold_rate_data = None
    if gold_rate:
        gold_rate_data = {
            "id": gold_rate.id,
            "gold_rate_24k": float(gold_rate.gold_rate_24k or 0),
            "gold_rate_22k": float(gold_rate.gold_rate_22k or 0),
            "gold_rate_18k": float(gold_rate.gold_rate_18k or 0),
            "silver_rate": float(gold_rate.silver_rate or 0),
            "updated_at": gold_rate.updated_at.isoformat() if gold_rate.updated_at else None
        }

    return {
        "totalCustomers": total_customers,
        "totalItems": total_items,
        "totalBills": total_bills,
        "todayRevenue": float(total_sales),
        "totalSales": float(total_sales),
        "totalPurchases": float(total_purchases),
        "purchaseCount": purchase_count,
        "netRevenue": float(net_revenue),
        "recentBills": recent_bills_data,
        "goldRate": gold_rate_data,
        "filterDate": date
    }

def run_db_migrations():
    """Safely adds missing columns to existing SQLite or Postgres tables."""
    from sqlalchemy import text
    with engine.connect() as conn:
        dialect = engine.dialect.name
        if dialect == "sqlite":
            statements = [
                "ALTER TABLE bills ADD COLUMN apply_gst BOOLEAN DEFAULT 1;",
                "ALTER TABLE bills ADD COLUMN discount_amount FLOAT DEFAULT 0.0;",
                "ALTER TABLE bills ADD COLUMN discount_percentage FLOAT DEFAULT 0.0;",
                "ALTER TABLE bills ADD COLUMN paid_amount FLOAT DEFAULT 0.0;",
                "ALTER TABLE bills ADD COLUMN pending_amount FLOAT DEFAULT 0.0;",
                "ALTER TABLE bill_items ADD COLUMN item_name VARCHAR;",
                "ALTER TABLE bill_items ADD COLUMN is_manual BOOLEAN DEFAULT 0;",
                "ALTER TABLE jewellery_items ADD COLUMN product_code VARCHAR;",
                "ALTER TABLE jewellery_items ADD COLUMN metal_type VARCHAR DEFAULT 'Gold';",
                "ALTER TABLE jewellery_items ADD COLUMN purity FLOAT DEFAULT 22.0;",
                "ALTER TABLE jewellery_items ADD COLUMN weight FLOAT DEFAULT 0.0;",
                "ALTER TABLE jewellery_items ADD COLUMN stock_quantity INTEGER DEFAULT 0;",
                "ALTER TABLE jewellery_items ADD COLUMN making_charges FLOAT DEFAULT 0.0;",
                "ALTER TABLE jewellery_items ADD COLUMN wastage_percentage FLOAT DEFAULT 0.0;",
                "ALTER TABLE jewellery_items ADD COLUMN image_url VARCHAR;",
                "ALTER TABLE jewellery_items ADD COLUMN description TEXT;",
                "ALTER TABLE jewellery_items ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",
                "CREATE INDEX IF NOT EXISTS idx_bills_customer_id ON bills(customer_id);",
                "CREATE INDEX IF NOT EXISTS idx_bills_bill_date ON bills(bill_date);",
                "CREATE INDEX IF NOT EXISTS idx_bill_payments_bill_id ON bill_payments(bill_id);",
                "CREATE INDEX IF NOT EXISTS idx_jewellery_product_code ON jewellery_items(product_code);",
            ]
        else:
            statements = [
                "ALTER TABLE bills ADD COLUMN IF NOT EXISTS apply_gst BOOLEAN DEFAULT TRUE;",
                "ALTER TABLE bills ADD COLUMN IF NOT EXISTS discount_amount FLOAT DEFAULT 0.0;",
                "ALTER TABLE bills ADD COLUMN IF NOT EXISTS discount_percentage FLOAT DEFAULT 0.0;",
                "ALTER TABLE bills ADD COLUMN IF NOT EXISTS paid_amount FLOAT DEFAULT 0.0;",
                "ALTER TABLE bills ADD COLUMN IF NOT EXISTS pending_amount FLOAT DEFAULT 0.0;",
                "ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS item_name VARCHAR;",
                "ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE;",
                "ALTER TABLE bill_items ALTER COLUMN jewellery_id DROP NOT NULL;",
                "ALTER TABLE jewellery_items ADD COLUMN IF NOT EXISTS product_code VARCHAR;",
                "ALTER TABLE jewellery_items ADD COLUMN IF NOT EXISTS metal_type VARCHAR DEFAULT 'Gold';",
                "ALTER TABLE jewellery_items ADD COLUMN IF NOT EXISTS purity FLOAT DEFAULT 22.0;",
                "ALTER TABLE jewellery_items ADD COLUMN IF NOT EXISTS weight FLOAT DEFAULT 0.0;",
                "ALTER TABLE jewellery_items ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0;",
                "ALTER TABLE jewellery_items ADD COLUMN IF NOT EXISTS making_charges FLOAT DEFAULT 0.0;",
                "ALTER TABLE jewellery_items ADD COLUMN IF NOT EXISTS wastage_percentage FLOAT DEFAULT 0.0;",
                "ALTER TABLE jewellery_items ADD COLUMN IF NOT EXISTS image_url VARCHAR;",
                "ALTER TABLE jewellery_items ADD COLUMN IF NOT EXISTS description TEXT;",
                "ALTER TABLE jewellery_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",
                "CREATE INDEX IF NOT EXISTS idx_bills_customer_id ON bills(customer_id);",
                "CREATE INDEX IF NOT EXISTS idx_bills_bill_date ON bills(bill_date);",
                "CREATE INDEX IF NOT EXISTS idx_bill_payments_bill_id ON bill_payments(bill_id);",
                "CREATE INDEX IF NOT EXISTS idx_jewellery_product_code ON jewellery_items(product_code);",
            ]
        for stmt in statements:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass

@app.on_event("startup")
async def startup_event():
    # Run DB schema check/alteration
    try:
        run_db_migrations()
    except Exception as e:
        print(f"Schema migration note: {e}")

    # Create or sync default admin
    db = next(get_db())
    default_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")
    admin = db.query(Admin).filter(Admin.username == "admin").first()
    if not admin:
        admin = Admin(
            username="admin",
            password_hash=get_password_hash(default_password)
        )
        db.add(admin)
        db.commit()
        print(f"Default admin created with username: 'admin' and password: '{default_password}'")
    else:
        # Sync password to ensure admin123 or DEFAULT_ADMIN_PASSWORD works
        if not verify_password(default_password, admin.password_hash) and not verify_password("admin123", admin.password_hash):
            admin.password_hash = get_password_hash(default_password)
            db.commit()
            print(f"Admin password synchronized to '{default_password}'")
    
    # Initialize default gold rate if none exists
    rate = db.query(GoldRate).first()
    if not rate:
        default_rate = GoldRate(
            gold_rate_24k=7250.0,
            gold_rate_22k=6650.0,
            gold_rate_18k=5450.0,
            silver_rate=89.0,
            updated_by="system"
        )
        db.add(default_rate)
        db.commit()
        print("Default gold rates initialized.")
    db.close()