from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date
from ..database import get_db
from ..models import Purchase
from ..schemas import PurchaseCreate, PurchaseResponse
from ..auth import verify_token

router = APIRouter(prefix="/purchases", tags=["purchases"])

@router.post("/", response_model=PurchaseResponse, status_code=status.HTTP_201_CREATED)
async def create_purchase(
    purchase_in: PurchaseCreate,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    purchase_date = purchase_in.purchase_date or datetime.utcnow()
    new_purchase = Purchase(
        supplier_name=purchase_in.supplier_name.strip(),
        item_name=purchase_in.item_name.strip(),
        quantity=purchase_in.quantity,
        cost=purchase_in.cost,
        purchase_date=purchase_date,
        notes=purchase_in.notes
    )
    db.add(new_purchase)
    db.commit()
    db.refresh(new_purchase)
    return new_purchase

@router.get("/", response_model=List[PurchaseResponse])
async def get_purchases(
    date_filter: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    query = db.query(Purchase)

    if date_filter:
        try:
            target_date = datetime.strptime(date_filter, "%Y-%m-%d").date()
            start_time = datetime.combine(target_date, datetime.min.time())
            end_time = datetime.combine(target_date, datetime.max.time())
            query = query.filter(Purchase.purchase_date >= start_time, Purchase.purchase_date <= end_time)
        except ValueError:
            pass

    if search and search.strip():
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            (Purchase.supplier_name.ilike(search_pattern)) | 
            (Purchase.item_name.ilike(search_pattern))
        )

    purchases = query.order_by(Purchase.purchase_date.desc()).offset(skip).limit(limit).all()
    return purchases

@router.get("/stats")
async def get_purchase_stats(
    date_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    query = db.query(Purchase)
    if date_filter:
        try:
            target_date = datetime.strptime(date_filter, "%Y-%m-%d").date()
            start_time = datetime.combine(target_date, datetime.min.time())
            end_time = datetime.combine(target_date, datetime.max.time())
            query = query.filter(Purchase.purchase_date >= start_time, Purchase.purchase_date <= end_time)
        except ValueError:
            pass

    all_purchases = query.all()
    total_amount = sum(p.total_cost for p in all_purchases)
    total_count = len(all_purchases)

    return {
        "totalPurchases": float(total_amount),
        "purchaseCount": total_count
    }

@router.delete("/{purchase_id}")
async def delete_purchase(
    purchase_id: int,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    
    db.delete(purchase)
    db.commit()
    return {"message": "Purchase deleted successfully", "id": purchase_id}
