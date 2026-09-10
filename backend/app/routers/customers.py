from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from typing import List
import uuid
import csv
import io
from datetime import datetime
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

@router.get("/export")
async def export_customers_excel(
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    customers = db.query(Customer).order_by(Customer.name.asc()).all()
    
    output = io.StringIO()
    # Write UTF-8 BOM so Excel opens with proper character encoding
    output.write('\ufeff')
    
    writer = csv.writer(output)
    writer.writerow([
        "Customer ID",
        "Customer Name",
        "Phone Number",
        "Email",
        "Residential Address",
        "Total Invoices",
        "Total Billed (₹)",
        "Total Paid (₹)",
        "Pending Balance (₹)",
        "Created Date"
    ])
    
    for c in customers:
        bills = c.bills or []
        total_billed = sum(getattr(b, 'total_amount', 0.0) or 0.0 for b in bills)
        total_paid = sum(getattr(b, 'paid_amount', 0.0) or (b.total_amount if b.payment_status == 'paid' else 0.0) for b in bills)
        total_pending = sum(getattr(b, 'pending_amount', 0.0) or max(0.0, (b.total_amount or 0.0) - (b.paid_amount or 0.0)) for b in bills)
        
        created_str = c.created_at.strftime('%Y-%m-%d') if getattr(c, 'created_at', None) else "-"
        phone_str = f"'{c.phone}" if c.phone else "-"
        
        writer.writerow([
            c.customer_id,
            c.name,
            phone_str,
            c.email or "-",
            c.address or "-",
            len(bills),
            f"{total_billed:.2f}",
            f"{total_paid:.2f}",
            f"{total_pending:.2f}",
            created_str
        ])
    
    csv_content = output.getvalue()
    filename = f"Customers_Export_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    
    return Response(
        content=csv_content.encode('utf-8-sig'),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )

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