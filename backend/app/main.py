from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

try:
    from .database import engine, get_db, Base
    from .models import Admin
    from .auth import verify_password, create_access_token, get_password_hash
    from .routers import customers, inventory, gold_rate, billing
except ImportError:
    from database import engine, get_db, Base
    from models import Admin
    from auth import verify_password, create_access_token, get_password_hash
    from routers import customers, inventory, gold_rate, billing

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

# Include routers
app.include_router(customers.router)
app.include_router(inventory.router)
app.include_router(gold_rate.router)
app.include_router(billing.router)

@app.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    admin = db.query(Admin).filter(Admin.username == form_data.username).first()
    if not admin or not verify_password(form_data.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": admin.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/")
async def root():
    return {"message": "Jewellery Shop ERP API", "version": "1.0.0"}

@app.on_event("startup")
async def startup_event():
    # Create default admin if not exists
    db = next(get_db())
    admin = db.query(Admin).filter(Admin.username == "admin").first()
    if not admin:
        default_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")
        admin = Admin(
            username="admin",
            password_hash=get_password_hash(default_password)
        )
        db.add(admin)
        db.commit()
        print(f"Default admin created with username: 'admin' and password: '{default_password}'")
    
    # Initialize default gold rate if none exists
    try:
        from .models import GoldRate
    except ImportError:
        from models import GoldRate
    
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