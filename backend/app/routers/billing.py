from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
import uuid
import os
from datetime import datetime
from ..database import get_db
from ..models import Bill, BillItem, Customer, JewelleryItem, GoldRate, BillPayment
from ..schemas import BillCreate, BillResponse, BillItemCreate, BillPaymentCreate, BillPaymentResponse
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
    
    apply_gst = True if bill.apply_gst is None else bill.apply_gst
    discount_amount = float(bill.discount_amount or 0.0)
    discount_percentage = float(bill.discount_percentage or 0.0)

    # Create bill
    invoice_number = generate_invoice_number()
    db_bill = Bill(
        invoice_number=invoice_number,
        customer_id=bill.customer_id,
        payment_status=bill.payment_status,
        payment_method=bill.payment_method,
        notes=bill.notes,
        apply_gst=apply_gst,
        discount_amount=discount_amount,
        discount_percentage=discount_percentage,
        subtotal=0,
        gst_amount=0,
        total_amount=0
    )
    db.add(db_bill)
    db.flush()
    
    total_subtotal = 0.0
    
    # Process bill items
    for item in bill.items:
        # Check if this is a manual billing item (non-inventory)
        if item.is_manual or not item.jewellery_id:
            manual_name = (item.name or "Custom Item").strip()
            qty = max(1, item.quantity)
            rate = float(item.rate or 0.0)
            item_total = float(item.total) if item.total is not None else (rate * qty)
            
            db_bill_item = BillItem(
                bill_id=db_bill.id,
                jewellery_id=None,
                item_name=manual_name,
                is_manual=True,
                quantity=qty,
                weight=0.0,
                purity=0.0,
                rate_per_gram=rate,
                making_charges=0.0,
                wastage_charges=0.0,
                gst_amount=0.0,
                total_price=item_total
            )
            db.add(db_bill_item)
            total_subtotal += item_total
            continue

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
        
        purity_factor = jewellery.purity / 24
        gold_value = jewellery.weight * rate_24k * purity_factor

        # Custom making charges (Fixed or Percentage)
        if item.making_charges_type == "percentage" and item.making_charges_value is not None:
            making_charge_val = gold_value * (float(item.making_charges_value) / 100.0)
        elif item.making_charges_value is not None:
            making_charge_val = float(item.making_charges_value)
        else:
            making_charge_val = jewellery.weight * jewellery.making_charges

        wastage_charge_val = gold_value * (jewellery.wastage_percentage / 100.0)
        item_unit_subtotal = gold_value + making_charge_val + wastage_charge_val
        item_subtotal = item_unit_subtotal * item.quantity

        # Create bill item
        db_bill_item = BillItem(
            bill_id=db_bill.id,
            jewellery_id=jewellery.id,
            item_name=jewellery.name,
            is_manual=False,
            quantity=item.quantity,
            weight=jewellery.weight * item.quantity,
            purity=jewellery.purity,
            rate_per_gram=rate_24k * purity_factor,
            making_charges=making_charge_val * item.quantity,
            wastage_charges=wastage_charge_val * item.quantity,
            gst_amount=0.0,
            total_price=item_subtotal
        )
        db.add(db_bill_item)
        
        # Update stock
        jewellery.stock_quantity -= item.quantity
        total_subtotal += item_subtotal
    
    # Calculate discount
    if discount_percentage > 0 and discount_amount == 0:
        discount_amount = total_subtotal * (discount_percentage / 100.0)
    elif discount_amount > 0 and discount_percentage == 0 and total_subtotal > 0:
        discount_percentage = (discount_amount / total_subtotal) * 100.0
    
    taxable_amount = max(0.0, total_subtotal - discount_amount)
    
    # Calculate GST (3% or 0% if toggled OFF)
    if apply_gst:
        total_gst = round(taxable_amount * 0.03, 2)
    else:
        total_gst = 0.0
    
    total_amount = round(taxable_amount + total_gst, 2)
    
    # Calculate Paid and Pending Amount
    if bill.paid_amount is not None:
        paid_amount = max(0.0, float(bill.paid_amount))
    elif bill.payment_status == "unpaid":
        paid_amount = 0.0
    else:
        paid_amount = total_amount  # Default is paid in full

    pending_amount = max(0.0, round(total_amount - paid_amount, 2))

    if pending_amount <= 0.001:
        computed_status = "paid"
        pending_amount = 0.0
    elif paid_amount > 0:
        computed_status = "partial"
    else:
        computed_status = "unpaid"

    # Update bill totals
    db_bill.subtotal = round(total_subtotal, 2)
    db_bill.discount_amount = round(discount_amount, 2)
    db_bill.discount_percentage = round(discount_percentage, 2)
    db_bill.apply_gst = apply_gst
    db_bill.gst_amount = total_gst
    db_bill.total_amount = total_amount
    db_bill.paid_amount = round(paid_amount, 2)
    db_bill.pending_amount = round(pending_amount, 2)
    db_bill.payment_status = computed_status
    
    # Record initial payment if paid_amount > 0
    if paid_amount > 0:
        initial_payment = BillPayment(
            bill_id=db_bill.id,
            amount=round(paid_amount, 2),
            payment_method=bill.payment_method or "cash",
            payment_date=db_bill.bill_date or datetime.utcnow(),
            notes="Initial payment at billing"
        )
        db.add(initial_payment)

    db.commit()
    db.refresh(db_bill)
    
    # Generate PDF invoice
    generate_pdf_invoice(db_bill.id, db)
    
    return db_bill

def generate_pdf_invoice(bill_id: int, db: Session):
    bill = db.query(Bill).filter(Bill.id == bill_id).first()
    customer = db.query(Customer).filter(Customer.id == bill.customer_id).first()
    items = db.query(BillItem).filter(BillItem.bill_id == bill.id).all()
    payments = db.query(BillPayment).filter(BillPayment.bill_id == bill.id).order_by(BillPayment.payment_date.asc()).all()
    
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
        [Paragraph(f"<b>Customer:</b> {customer.name if customer else 'Walk-in Customer'}", styles['Normal'])],
        [Paragraph(f"<b>Customer ID:</b> {customer.customer_id if customer else '-'}", styles['Normal'])],
        [Paragraph(f"<b>Phone:</b> {customer.phone if customer else '-'}", styles['Normal'])],
    ]
    
    for info in invoice_info:
        elements.append(info[0])
    
    elements.append(Spacer(1, 20))
    
    # Add items table
    table_data = [
        ['Item', 'Qty', 'Weight(g)', 'Purity', 'Rate/g', 'Making', 'GST', 'Total']
    ]
    
    for item in items:
        if item.is_manual or not item.jewellery_id:
            table_data.append([
                item.jewellery_name,
                str(item.quantity),
                "-",
                "-",
                f"₹{item.rate_per_gram:.2f}",
                "-",
                "-",
                f"₹{item.total_price:.2f}"
            ])
        else:
            table_data.append([
                item.jewellery_name,
                str(item.quantity),
                f"{item.weight:.2f}",
                f"{item.purity}K",
                f"₹{item.rate_per_gram:.2f}",
                f"₹{item.making_charges:.2f}",
                f"₹{item.gst_amount:.2f}",
                f"₹{item.total_price:.2f}"
            ])
    
    # Add totals rows
    table_data.append(['', '', '', '', '', '', 'Subtotal:', f"₹{bill.subtotal:.2f}"])
    
    if getattr(bill, 'discount_amount', 0) and bill.discount_amount > 0:
        disc_label = f"Discount ({bill.discount_percentage:.1f}%):" if getattr(bill, 'discount_percentage', 0) else "Discount:"
        table_data.append(['', '', '', '', '', '', disc_label, f"-₹{bill.discount_amount:.2f}"])
    
    if getattr(bill, 'apply_gst', True):
        table_data.append(['', '', '', '', '', '', 'GST (3%):', f"₹{bill.gst_amount:.2f}"])
    else:
        table_data.append(['', '', '', '', '', '', 'GST (0% - OFF):', "₹0.00"])
        
    table_data.append(['', '', '', '', '', '', 'Grand Total:', f"₹{bill.total_amount:.2f}"])
    
    table = Table(table_data, colWidths=[2*inch, 0.5*inch, 1*inch, 0.75*inch, 0.75*inch, 0.75*inch, 0.75*inch, 0.75*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, -1), (-1, -1), colors.lightgrey),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('BOX', (0, 0), (-1, -1), 2, colors.black),
    ]))
    elements.append(table)
    
    elements.append(Spacer(1, 20))
    
    # Add payment details
    paid_amt = getattr(bill, 'paid_amount', 0.0) or (bill.total_amount if bill.payment_status == 'paid' else 0.0)
    pending_amt = getattr(bill, 'pending_amount', 0.0) or max(0.0, bill.total_amount - paid_amt)

    payment_info = [
        [Paragraph(f"<b>Payment Status:</b> {bill.payment_status.upper()}", styles['Normal'])],
        [Paragraph(f"<b>Payment Mode:</b> {bill.payment_method.upper()}", styles['Normal'])],
        [Paragraph(f"<b>Amount Paid:</b> ₹{paid_amt:.2f}", styles['Normal'])],
        [Paragraph(f"<b>Pending / Balance Due:</b> ₹{pending_amt:.2f}", styles['Normal'])],
    ]
    
    for info in payment_info:
        elements.append(info[0])

    # Add Payment Installments History table if multiple payments exist
    if payments and len(payments) > 0:
        elements.append(Spacer(1, 10))
        elements.append(Paragraph("<b>Payment Receipts & Installments:</b>", styles['Normal']))
        elements.append(Spacer(1, 5))
        
        pay_table_data = [['#', 'Date', 'Amount Paid', 'Mode', 'Notes']]
        for idx, p in enumerate(payments, 1):
            p_date_str = p.payment_date.strftime('%Y-%m-%d %H:%M') if p.payment_date else '-'
            pay_table_data.append([
                str(idx),
                p_date_str,
                f"₹{p.amount:.2f}",
                (p.payment_method or "cash").upper(),
                p.notes or "-"
            ])
            
        pay_table = Table(pay_table_data, colWidths=[0.4*inch, 1.8*inch, 1.5*inch, 1.2*inch, 2.6*inch])
        pay_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        elements.append(pay_table)
    
    if bill.notes:
        elements.append(Spacer(1, 10))
        elements.append(Paragraph(f"<b>Notes:</b> {bill.notes}", styles['Normal']))
    
    elements.append(Spacer(1, 30))
    elements.append(Paragraph("Thank you for your purchase!", styles['Normal']))
    
    # Build PDF
    doc.build(elements)
    
    return pdf_path

@router.post("/{bill_id}/payments", response_model=BillResponse)
async def add_bill_payment(
    bill_id: int,
    payment_in: BillPaymentCreate,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    bill = db.query(Bill).filter(Bill.id == bill_id).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    
    if payment_in.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")

    pay_date = payment_in.payment_date or datetime.utcnow()
    new_payment = BillPayment(
        bill_id=bill.id,
        amount=round(float(payment_in.amount), 2),
        payment_method=payment_in.payment_method or "cash",
        payment_date=pay_date,
        notes=payment_in.notes
    )
    db.add(new_payment)
    db.flush()

    # Recalculate total paid from all payments
    all_payments = db.query(BillPayment).filter(BillPayment.bill_id == bill.id).all()
    total_paid = sum(p.amount for p in all_payments)
    
    bill.paid_amount = round(total_paid, 2)
    bill.pending_amount = max(0.0, round(float(bill.total_amount or 0.0) - total_paid, 2))

    if bill.pending_amount <= 0.001:
        bill.payment_status = "paid"
        bill.pending_amount = 0.0
    elif bill.paid_amount > 0:
        bill.payment_status = "partial"
    else:
        bill.payment_status = "unpaid"

    db.commit()
    db.refresh(bill)

    # Re-generate updated PDF invoice
    try:
        generate_pdf_invoice(bill.id, db)
    except Exception as pdf_err:
        print(f"PDF regeneration error on payment: {pdf_err}")

    return bill

@router.get("/{bill_id}/payments", response_model=List[BillPaymentResponse])
async def get_bill_payments(
    bill_id: int,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    bill = db.query(Bill).filter(Bill.id == bill_id).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    return bill.payments

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