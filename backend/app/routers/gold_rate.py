from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..models import GoldRate
from ..schemas import GoldRateCreate, GoldRateResponse
from ..auth import verify_token

router = APIRouter(prefix="/gold-rate", tags=["gold-rate"])

@router.post("/", response_model=GoldRateResponse)
async def update_gold_rate(
    rate: GoldRateCreate,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    # Check if rate for today already exists
    today = datetime.utcnow().date()
    existing = db.query(GoldRate).filter(
        GoldRate.date >= datetime.combine(today, datetime.min.time())
    ).first()
    
    if existing:
        # Update existing rate
        for key, value in rate.dict().items():
            setattr(existing, key, value)
        existing.updated_by = username
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing
    else:
        # Create new rate
        db_rate = GoldRate(
            **rate.dict(),
            updated_by=username
        )
        db.add(db_rate)
        db.commit()
        db.refresh(db_rate)
        return db_rate

@router.get("/", response_model=Optional[GoldRateResponse])
async def get_today_rate(
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    today = datetime.utcnow().date()
    rate = db.query(GoldRate).filter(
        GoldRate.date >= datetime.combine(today, datetime.min.time())
    ).first()
    
    if not rate:
        # Return last known rate
        rate = db.query(GoldRate).order_by(GoldRate.date.desc()).first()
    
    return rate