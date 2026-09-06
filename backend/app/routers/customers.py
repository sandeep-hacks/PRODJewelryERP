from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import uuid
from ..database import get_db
from ..models import Customer, Bill
from ..schemas import CustomerCreate, CustomerResponse, BillResponse
from ..auth import verify_token

router = APIRouter(prefix="/customers", tags=["customers"])

def generate_customer_id():
    return f"CUST-{uuid.uuid4().hex[:8].upper()}"

@router.post("/", response_model=CustomerResponse)
async def create_customer(
    customer: CustomerCreate,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    db_customer = Customer(
        customer_id=generate_customer_id(),
        name=customer.name,
        phone=customer.phone,
        address=customer.address,
        email=customer.email
    )
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.get("/", response_model=List[CustomerResponse])
async def get_customers(
    search: str = "",
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    query = db.query(Customer)
    if search:
        query = query.filter(
            (Customer.name.ilike(f"%{search}%")) |
            (Customer.phone.ilike(f"%{search}%")) |
            (Customer.customer_id.ilike(f"%{search}%"))
        )
    return query.order_by(Customer.name.asc()).all()

@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer

@router.get("/{customer_id}/bills", response_model=List[BillResponse])
async def get_customer_bills(
    customer_id: int,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    bills = db.query(Bill).filter(Bill.customer_id == customer_id).order_by(Bill.bill_date.desc()).all()
    return bills