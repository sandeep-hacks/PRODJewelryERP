from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
import uuid
import os
from datetime import datetime
from ..database import get_db
from ..models import Bill, BillItem, Customer, JewelleryItem, GoldRate
from ..schemas import BillCreate, BillResponse, BillItemCreate
from ..auth import verify_token
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

router = APIRouter(prefix="/billing", tags=["billing"])

def generate_invoice_number():
    return f"INV-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

def calculate_price(weight, purity, rate_24k, making_charges_per_gram, wastage_percentage):
    # Calculate base gold value
    purity_factor = purity / 24
    gold_value = weight * rate_24k * purity_factor
    
    # Calculate making charges
    making_charges = weight * making_charges_per_gram
    
    # Calculate wastage charges
    wastage_charges = gold_value * (wastage_percentage / 100)
    
    # Calculate subtotal
    subtotal = gold_value + making_charges + wastage_charges
    
    # Calculate GST (3%)
    gst = subtotal * 0.03
    
    # Calculate total
    total = subtotal + gst
    
    return {
        "gold_value": gold_value,
        "making_charges": making_charges,
        "wastage_charges": wastage_charges,
        "subtotal": subtotal,
        "gst": gst,
        "total": total
    }

@router.post("/", response_model=BillResponse)
async def create_bill(
    bill: BillCreate,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    # Get customer
    customer = db.query(Customer).filter(Customer.id == bill.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Get today's gold rate
    today = datetime.utcnow().date()
    gold_rate = db.query(GoldRate).filter(
        GoldRate.date >= datetime.combine(today, datetime.min.time())
    ).first()
    
    if not gold_rate:
        gold_rate = db.query(GoldRate).order_by(GoldRate.date.desc()).first()
    
    if not gold_rate:
        raise HTTPException(status_code=400, detail="Gold rate not set")
    
    # Create bill
    invoice_number = generate_invoice_number()
    db_bill = Bill(
        invoice_number=invoice_number,
        customer_id=bill.customer_id,
        payment_status=bill.payment_status,
        payment_method=bill.payment_method,
        notes=bill.notes,
        subtotal=0,
        gst_amount=0,
        total_amount=0
    )
    db.add(db_bill)
    db.flush()
    
    total_subtotal = 0
    total_gst = 0
    total_amount = 0
    
    # Process bill items
    for item in bill.items:
        jewellery = db.query(JewelleryItem).filter(
            JewelleryItem.id == item.jewellery_id
        ).first()
        
        if not jewellery:
            raise HTTPException(status_code=404, detail=f"Item {item.jewellery_id} not found")
        
        if jewellery.stock_quantity < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {jewellery.name}"
            )
        
        # Calculate price based on metal type
        if jewellery.metal_type.lower() == "gold":
            rate_24k = gold_rate.gold_rate_24k
        else:
            rate_24k = gold_rate.silver_rate
        
        price_breakdown = calculate_price(
            jewellery.weight,
            jewellery.purity,
            rate_24k,
            jewellery.making_charges,
            jewellery.wastage_percentage
        )
        
        # Create bill item
        db_bill_item = BillItem(
            bill_id=db_bill.id,
            jewellery_id=jewellery.id,
            quantity=item.quantity,
            weight=jewellery.weight * item.quantity,
            purity=jewellery.purity,
            rate_per_gram=rate_24k * (jewellery.purity / 24),
            making_charges=price_breakdown["making_charges"] * item.quantity,
            wastage_charges=price_breakdown["wastage_charges"] * item.quantity,
            gst_amount=price_breakdown["gst"] * item.quantity,
            total_price=price_breakdown["total"] * item.quantity
        )
        db.add(db_bill_item)
        
        # Update stock
        jewellery.stock_quantity -= item.quantity
        
        total_subtotal += price_breakdown["subtotal"] * item.quantity
        total_gst += price_breakdown["gst"] * item.quantity
        total_amount += price_breakdown["total"] * item.quantity
    
    # Update bill totals
    db_bill.subtotal = total_subtotal
    db_bill.gst_amount = total_gst
    db_bill.total_amount = total_amount
    
    db.commit()
    db.refresh(db_bill)
    
    # Generate PDF invoice
    generate_pdf_invoice(db_bill.id, db)
    
    return db_bill

def generate_pdf_invoice(bill_id: int, db: Session):
    bill = db.query(Bill).filter(Bill.id == bill_id).first()
    customer = db.query(Customer).filter(Customer.id == bill.customer_id).first()
    items = db.query(BillItem).filter(BillItem.bill_id == bill.id).all()
    
    # Create PDF directory
    pdf_dir = "invoices"
    os.makedirs(pdf_dir, exist_ok=True)
    pdf_path = f"{pdf_dir}/{bill.invoice_number}.pdf"
    
    # Create PDF
    doc = SimpleDocTemplate(pdf_path, pagesize=A4)
    elements = []
    
    # Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=30,
        alignment=1
    )
    
    # Add title
    elements.append(Paragraph("Jewellery Shop Invoice", title_style))
    elements.append(Spacer(1, 20))
    
    # Add invoice details
    invoice_info = [
        [Paragraph(f"<b>Invoice Number:</b> {bill.invoice_number}", styles['Normal'])],
        [Paragraph(f"<b>Date:</b> {bill.bill_date.strftime('%Y-%m-%d %H:%M')}", styles['Normal'])],
        [Paragraph(f"<b>Customer:</b> {customer.name}", styles['Normal'])],
        [Paragraph(f"<b>Customer ID:</b> {customer.customer_id}", styles['Normal'])],
        [Paragraph(f"<b>Phone:</b> {customer.phone}", styles['Normal'])],
    ]
    
    for info in invoice_info:
        elements.append(info[0])
    
    elements.append(Spacer(1, 20))
    
    # Add items table
    table_data = [
        ['Item', 'Qty', 'Weight(g)', 'Purity', 'Rate/g', 'Making', 'GST', 'Total']
    ]
    
    for item in items:
        jewellery = db.query(JewelleryItem).filter(
            JewelleryItem.id == item.jewellery_id
        ).first()
        table_data.append([
            jewellery.name,
            str(item.quantity),
            f"{item.weight:.2f}",
            f"{item.purity}K",
            f"₹{item.rate_per_gram:.2f}",
            f"₹{item.making_charges:.2f}",
            f"₹{item.gst_amount:.2f}",
            f"₹{item.total_price:.2f}"
        ])
    
    # Add totals row
    table_data.append(['', '', '', '', '', '', 'Subtotal:', f"₹{bill.subtotal:.2f}"])
    table_data.append(['', '', '', '', '', '', 'GST (3%):', f"₹{bill.gst_amount:.2f}"])
    table_data.append(['', '', '', '', '', '', 'Total:', f"₹{bill.total_amount:.2f}"])
    
    table = Table(table_data, colWidths=[2*inch, 0.5*inch, 1*inch, 0.75*inch, 0.75*inch, 0.75*inch, 0.75*inch, 0.75*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, -3), (-1, -1), colors.lightgrey),
        ('FONTNAME', (0, -3), (-1, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -4), 1, colors.black),
        ('BOX', (0, 0), (-1, -1), 2, colors.black),
        ('LINEBELOW', (0, -4), (-1, -4), 2, colors.black),
    ]))
    elements.append(table)
    
    elements.append(Spacer(1, 30))
    
    # Add payment details
    payment_info = [
        [Paragraph(f"<b>Payment Status:</b> {bill.payment_status.upper()}", styles['Normal'])],
        [Paragraph(f"<b>Payment Method:</b> {bill.payment_method.upper()}", styles['Normal'])],
    ]
    
    for info in payment_info:
        elements.append(info[0])
    
    if bill.notes:
        elements.append(Spacer(1, 10))
        elements.append(Paragraph(f"<b>Notes:</b> {bill.notes}", styles['Normal']))
    
    elements.append(Spacer(1, 50))
    elements.append(Paragraph("Thank you for your purchase!", styles['Normal']))
    
    # Build PDF
    doc.build(elements)
    
    return pdf_path

@router.get("/", response_model=List[BillResponse])
async def get_bills(
    limit: int = 100,
    skip: int = 0,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    bills = db.query(Bill).order_by(Bill.bill_date.desc()).offset(skip).limit(limit).all()
    return bills

@router.get("/{bill_id}", response_model=BillResponse)
async def get_bill(
    bill_id: int,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    bill = db.query(Bill).filter(Bill.id == bill_id).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    return bill

@router.get("/{bill_id}/pdf")
async def get_bill_pdf(
    bill_id: int,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    bill = db.query(Bill).filter(Bill.id == bill_id).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    
    pdf_path = f"invoices/{bill.invoice_number}.pdf"
    if not os.path.exists(pdf_path):
        generate_pdf_invoice(bill_id, db)
    
    return FileResponse(pdf_path, filename=f"{bill.invoice_number}.pdf")