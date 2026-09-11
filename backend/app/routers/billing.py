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
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from ..invoice_assets import (
    HEADER_LOGO_PATH,
    WATERMARK_PATH,
    DIAMOND_ICON_PATH,
    LOCAL_DEVANAGARI_FONT,
    ensure_devanagari_font,
    generate_assets_if_needed,
    num_to_words_indian
)

# Register Devanagari font in ReportLab for clean Unicode / Hindi rendering
try:
    font_path = ensure_devanagari_font()
    if font_path and os.path.exists(font_path):
        pdfmetrics.registerFont(TTFont("Devanagari", font_path))
except Exception as e:
    print(f"ReportLab font registration error: {e}")

router = APIRouter(prefix="/billing", tags=["billing"])

def generate_invoice_number():
    return f"INV-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

def get_effective_metal_rate(gold_rate, metal_type, purity):
    """Accurately resolves rate for 24K, 22K, 18K, Silver, and custom purities"""
    if (metal_type or "").lower() == "silver":
        return float(getattr(gold_rate, "silver_rate", 89.0) or 89.0)
    
    p = float(purity or 22.0)
    # Check close match to 24K, 22K, 18K
    if abs(p - 24.0) < 0.2 and getattr(gold_rate, "gold_rate_24k", None):
        return float(gold_rate.gold_rate_24k)
    elif abs(p - 22.0) < 0.2 and getattr(gold_rate, "gold_rate_22k", None):
        return float(gold_rate.gold_rate_22k)
    elif abs(p - 18.0) < 0.2 and getattr(gold_rate, "gold_rate_18k", None):
        return float(gold_rate.gold_rate_18k)
    else:
        base_24 = float(getattr(gold_rate, "gold_rate_24k", 7250.0) or 7250.0)
        return (base_24 * p) / 24.0

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
    # Resolve customer: by customer_id or phone or auto-create seamlessly
    customer = None
    if bill.customer_id:
        customer = db.query(Customer).filter(Customer.id == bill.customer_id).first()
        
    if not customer and bill.customer_phone:
        clean_phone = bill.customer_phone.strip()
        customer = db.query(Customer).filter(Customer.phone == clean_phone).first()
        
    if not customer:
        if bill.customer_name and bill.customer_phone:
            customer = Customer(
                customer_id=f"CUST-{uuid.uuid4().hex[:8].upper()}",
                name=bill.customer_name.strip(),
                phone=bill.customer_phone.strip(),
                address=(bill.customer_address or "").strip() or None,
                email=(bill.customer_email or "").strip() or None
            )
            db.add(customer)
            db.commit()
            db.refresh(customer)
        else:
            raise HTTPException(status_code=400, detail="Customer name and phone number are required")
    else:
        # Update existing customer with any newly provided details
        updated_cust = False
        if bill.customer_name and bill.customer_name.strip() and customer.name != bill.customer_name.strip():
            customer.name = bill.customer_name.strip()
            updated_cust = True
        if bill.customer_address and bill.customer_address.strip() and customer.address != bill.customer_address.strip():
            customer.address = bill.customer_address.strip()
            updated_cust = True
        if bill.customer_email and bill.customer_email.strip() and customer.email != bill.customer_email.strip():
            customer.email = bill.customer_email.strip()
            updated_cust = True
        if updated_cust:
            db.commit()
            db.refresh(customer)
    
    # Get today's gold rate
    today = datetime.utcnow().date()
    gold_rate = db.query(GoldRate).filter(
        GoldRate.date >= datetime.combine(today, datetime.min.time())
    ).first()
    
    if not gold_rate:
        gold_rate = db.query(GoldRate).order_by(GoldRate.date.desc()).first()
    
    if not gold_rate:
        raise HTTPException(status_code=400, detail="Gold rate not set")
    
    apply_gst = False if bill.apply_gst is None else bill.apply_gst
    discount_amount = float(bill.discount_amount or 0.0)
    discount_percentage = float(bill.discount_percentage or 0.0)

    # Create bill
    invoice_number = generate_invoice_number()
    db_bill = Bill(
        invoice_number=invoice_number,
        customer_id=customer.id,
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
            weight = float(item.weight or 0.0)
            purity = float(item.purity or 0.0)
            wastage_pct = float(item.wastage_percentage or 0.0)
            
            metal_type = (item.metal_type or "Gold").lower()
            effective_rate = get_effective_metal_rate(gold_rate, metal_type, purity)
            
            if weight > 0:
                gold_value = weight * effective_rate
                
                # Making charges calculation
                if item.making_charges_type == "percentage" and item.making_charges_value is not None:
                    making_charge_val = gold_value * (float(item.making_charges_value) / 100.0)
                elif item.making_charges_value is not None:
                    making_charge_val = float(item.making_charges_value)
                else:
                    making_charge_val = 0.0
                
                wastage_charge_val = gold_value * (wastage_pct / 100.0)
                item_unit_subtotal = gold_value + making_charge_val + wastage_charge_val
                item_total = float(item.total) if item.total is not None else (item_unit_subtotal * qty)
                rate_to_store = effective_rate
                making_to_store = making_charge_val * qty
                wastage_to_store = wastage_charge_val * qty
            else:
                rate_to_store = float(item.rate or item.rate_per_gram or effective_rate)
                item_total = float(item.total) if item.total is not None else (rate_to_store * qty)
                making_to_store = float(item.making_charges_value or 0.0) * qty if item.making_charges_type == "fixed" else 0.0
                wastage_to_store = 0.0

            db_bill_item = BillItem(
                bill_id=db_bill.id,
                jewellery_id=None,
                item_name=manual_name,
                is_manual=True,
                quantity=qty,
                weight=weight * qty,
                purity=purity,
                rate_per_gram=rate_to_store,
                making_charges=making_to_store,
                wastage_charges=wastage_to_store,
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
        
        # Calculate price based on metal type and purity, prioritizing user customized values
        item_weight = float(item.weight) if (item.weight is not None and float(item.weight) > 0) else float(jewellery.weight or 0.0)
        
        metal_type = (item.metal_type or jewellery.metal_type or "Gold").lower()
        if metal_type == 'silver':
            item_purity = 0.0
        else:
            item_purity = float(item.purity) if (item.purity is not None and float(item.purity) > 0) else float(jewellery.purity or 22.0)

        default_rate = get_effective_metal_rate(gold_rate, metal_type, item_purity)
        if item.rate_per_gram is not None and float(item.rate_per_gram) > 0:
            effective_rate = float(item.rate_per_gram)
        elif item.rate is not None and float(item.rate) > 0:
            effective_rate = float(item.rate)
        else:
            effective_rate = default_rate

        gold_value = item_weight * effective_rate

        # Custom making charges (Fixed or Percentage)
        if item.making_charges_type == "percentage" and item.making_charges_value is not None:
            making_charge_val = gold_value * (float(item.making_charges_value) / 100.0)
        elif item.making_charges_value is not None:
            making_charge_val = float(item.making_charges_value)
        else:
            making_charge_val = item_weight * float(jewellery.making_charges or 0.0)

        wastage_pct = float(item.wastage_percentage) if item.wastage_percentage is not None else float(jewellery.wastage_percentage or 0.0)
        wastage_charge_val = gold_value * (wastage_pct / 100.0)
        
        item_unit_subtotal = gold_value + making_charge_val + wastage_charge_val
        item_subtotal = float(item.total) if (item.total is not None and float(item.total) > 0) else (item_unit_subtotal * item.quantity)

        item_name = (item.name or jewellery.name or "Jewellery Item").strip()

        # Create bill item
        db_bill_item = BillItem(
            bill_id=db_bill.id,
            jewellery_id=jewellery.id,
            item_name=item_name,
            is_manual=False,
            quantity=item.quantity,
            weight=item_weight * item.quantity,
            purity=item_purity,
            rate_per_gram=effective_rate,
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

def draw_rupee_vector(c, x, y, size=7.5, color=colors.HexColor('#111827')):
    """Draws a crisp Indian Rupee symbol vector on canvas"""
    c.saveState()
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(max(0.65, size * 0.09))
    
    bar_w = size * 0.58
    top_y = y + size * 0.72
    mid_y = y + size * 0.48
    stem_x = x + size * 0.12
    
    # Upper horizontal bar
    c.line(x, top_y, x + bar_w, top_y)
    # Middle horizontal bar
    c.line(x, mid_y, x + bar_w * 0.85, mid_y)
    # Vertical upper stem
    c.line(stem_x, top_y, stem_x, y + size * 0.28)
    
    # Upper semi-circle loop
    p = c.beginPath()
    p.moveTo(stem_x, top_y)
    p.curveTo(x + size * 0.62, top_y, x + size * 0.62, mid_y, stem_x, mid_y)
    c.drawPath(p, stroke=1, fill=0)
    
    # Downward diagonal slash leg
    c.line(stem_x + size * 0.05, mid_y, x + size * 0.55, y)
    c.restoreState()

def draw_currency(c, x, y, amount_val, font_size=8.5, font_name="Helvetica", bold=False, color=colors.HexColor('#111827'), align="right"):
    """Draws ₹ symbol followed by formatted amount, e.g. ₹ 86,258.38"""
    val_str = f"{amount_val:,.2f}"
    actual_font = f"{font_name}-Bold" if bold else font_name
    c.setFont(actual_font, font_size)
    c.setFillColor(color)
    
    text_width = c.stringWidth(val_str, actual_font, font_size)
    gap = 2.5
    symbol_width = font_size * 0.58
    total_w = symbol_width + gap + text_width
    
    if align == "right":
        start_x = x - total_w
    elif align == "center":
        start_x = x - total_w / 2.0
    else:
        start_x = x
        
    draw_rupee_vector(c, start_x, y, size=font_size, color=color)
    c.drawString(start_x + symbol_width + gap, y, val_str)

def draw_col_header(c, cx, cy, title, font_size=7.5, color=colors.HexColor('#111827')):
    """Draws column header, rendering (₹) cleanly if present"""
    c.setFont("Helvetica-Bold", font_size)
    c.setFillColor(color)
    if "(₹)" in title:
        prefix = title.replace("(₹)", "(").strip()
        prefix_w = c.stringWidth(prefix, "Helvetica-Bold", font_size)
        sym_w = font_size * 0.58
        close_w = c.stringWidth(")", "Helvetica-Bold", font_size)
        total_w = prefix_w + sym_w + close_w + 1.5
        
        start_x = cx - total_w / 2.0
        c.drawString(start_x, cy, prefix)
        draw_rupee_vector(c, start_x + prefix_w + 1.0, cy, size=font_size * 0.95, color=color)
        c.drawString(start_x + prefix_w + sym_w + 1.5, cy, ")")
    else:
        c.drawCentredString(cx, cy, title)

def generate_pdf_invoice(bill_id: int, db: Session):
    bill = db.query(Bill).filter(Bill.id == bill_id).first()
    customer = db.query(Customer).filter(Customer.id == bill.customer_id).first()
    items = db.query(BillItem).filter(BillItem.bill_id == bill.id).all()
    
    # Ensure branding assets are available
    generate_assets_if_needed()
    
    # Create PDF directory
    pdf_dir = "invoices"
    os.makedirs(pdf_dir, exist_ok=True)
    pdf_path = f"{pdf_dir}/{bill.invoice_number}.pdf"
    
    c = canvas.Canvas(pdf_path, pagesize=A4)
    page_w, page_h = A4  # 595.27 x 841.89
    
    # Outer frame coordinates
    margin = 18.0
    x_left = margin
    x_right = page_w - margin
    y_bot = margin
    y_top = page_h - margin
    box_w = x_right - x_left
    box_h = y_top - y_bot
    
    # 1. Outer Border
    c.setStrokeColor(colors.HexColor('#737373'))
    c.setLineWidth(0.9)
    c.rect(x_left, y_bot, box_w, box_h, stroke=1, fill=0)
    
    # 2. Header Area
    sep1_y = 728.0
    
    # 2a. Diamond Logo on top left
    if os.path.exists(DIAMOND_ICON_PATH):
        c.drawImage(DIAMOND_ICON_PATH, 36, 742, width=58, height=58, mask='auto')
        
    # 2b. Central Shop Header Name "श्रवण ज्वेलर्स" + Slogan + Shop Address (Large & Prominent)
    dev_font = "Devanagari" if "Devanagari" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"
    if os.path.exists(HEADER_LOGO_PATH):
        header_w = 270.0
        header_h = 52.0
        c.drawImage(HEADER_LOGO_PATH, (page_w - header_w) / 2.0, 755, width=header_w, height=header_h, mask='auto')
        c.setFont(dev_font, 10.0)
        c.setFillColor(colors.HexColor('#111827'))
        c.drawCentredString(page_w / 2.0, 738, "मेन रोड, नियर शिव मंदिर, रितुडीह, बोकारो, झारखंड")
    else:
        c.setFillColor(colors.HexColor('#78350F'))
        c.setFont(dev_font, 20)
        c.drawCentredString(page_w / 2.0, 786, "श्रवण ज्वेलर्स")
        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(colors.HexColor('#B45309'))
        c.drawCentredString(page_w / 2.0, 771, "TRUST  |  PURITY  |  TIMELESS BEAUTY")
        c.setFont(dev_font, 10.0)
        c.setFillColor(colors.HexColor('#111827'))
        c.drawCentredString(page_w / 2.0, 752, "मेन रोड, नियर शिव मंदिर, रितुडीह, बोकारो, झारखंड")
        
    # 2c. Top Right Header text
    c.setFillColor(colors.HexColor('#111827'))
    c.setFont("Helvetica-Bold", 10.5)
    c.drawRightString(x_right - 14, 802, "INVOICE")
    c.setFont("Helvetica", 8.0)
    c.setFillColor(colors.HexColor('#4B5563'))
    c.drawRightString(x_right - 14, 788, "GSTIN : 36XXXXXXXX0X")
    c.setFont("Helvetica-Bold", 8.0)
    c.setFillColor(colors.HexColor('#1F2937'))
    c.drawRightString(x_right - 14, 774, "Mob : 9835864673, 6205298826")
    c.setFont("Helvetica", 7.5)
    c.setFillColor(colors.HexColor('#6B7280'))
    c.drawRightString(x_right - 14, 760, "Bokaro, Jharkhand")
    
    # Horizontal Divider 1
    c.setStrokeColor(colors.HexColor('#9CA3AF'))
    c.setLineWidth(0.7)
    c.line(x_left, sep1_y, x_right, sep1_y)
    
    # 3. Bill To / Invoice Details Box
    sep2_y = 642.0
    x_mid = 328.0
    
    # Vertical divider line
    c.setStrokeColor(colors.HexColor('#D1D5DB'))
    c.setLineWidth(0.7)
    c.line(x_mid, sep1_y, x_mid, sep2_y)
    
    # Customer Details (Left)
    cust_name = (customer.name if customer else "Walk-in Customer")
    cust_phone = (customer.phone if customer and customer.phone else "-")
    cust_id = (customer.customer_id if customer and customer.customer_id else "-")
    cust_address = (customer.address.strip() if customer and customer.address else "")
    cust_email = (customer.email.strip() if customer and customer.email else "")
    has_hindi_cust = any(ord(ch) > 127 for ch in cust_name)
    has_hindi_addr = any(ord(ch) > 127 for ch in cust_address)
    
    c.setFont("Helvetica-Bold", 8.0)
    c.setFillColor(colors.HexColor('#6B7280'))
    c.drawString(32, 714, "BILL TO (CUSTOMER DETAILS)")
    
    c.setFont(dev_font if has_hindi_cust else "Helvetica-Bold", 9.5)
    c.setFillColor(colors.HexColor('#111827'))
    c.drawString(32, 699, cust_name)
    
    c.setFont("Helvetica-Bold", 8.0)
    c.setFillColor(colors.HexColor('#374151'))
    c.drawString(32, 685, "Phone : ")
    c.setFont("Helvetica", 8.0)
    c.drawString(68, 685, cust_phone)
    
    c.setFont("Helvetica-Bold", 8.0)
    c.drawString(175, 685, "Cust ID : ")
    c.setFont("Helvetica", 8.0)
    c.drawString(215, 685, cust_id)
    
    c.setFont("Helvetica-Bold", 8.0)
    c.setFillColor(colors.HexColor('#374151'))
    c.drawString(32, 671, "Address : ")
    addr_val = cust_address if cust_address else "Local / Counter Sale"
    c.setFont(dev_font if has_hindi_addr else "Helvetica", 8.0)
    c.setFillColor(colors.HexColor('#1F2937'))
    c.drawString(75, 671, addr_val[:48])
    
    if cust_email:
        c.setFont("Helvetica-Bold", 8.0)
        c.setFillColor(colors.HexColor('#374151'))
        c.drawString(32, 657, "Email : ")
        c.setFont("Helvetica", 8.0)
        c.drawString(68, 657, cust_email[:38])
    else:
        c.setFont("Helvetica-Oblique", 7.5)
        c.setFillColor(colors.HexColor('#9CA3AF'))
        c.drawString(32, 657, "Retail Jewellery Tax Invoice")
    
    # Invoice Details (Right)
    b_date_str = bill.bill_date.strftime('%Y-%m-%d %H:%M') if bill.bill_date else datetime.now().strftime('%Y-%m-%d %H:%M')
    p_method_str = (bill.payment_method or "CASH").upper()
    
    # Calculate Paid and Pending/Rest Amount for invoice display
    if bill.paid_amount is not None:
        paid_amt = float(bill.paid_amount)
    elif bill.payment_status == 'paid':
        paid_amt = float(bill.total_amount)
    else:
        paid_amt = 0.0

    if bill.pending_amount is not None:
        pending_amt = float(bill.pending_amount)
    elif bill.payment_status == 'paid':
        pending_amt = 0.0
    else:
        pending_amt = max(0.0, float(bill.total_amount) - paid_amt)
        
    is_due = pending_amt > 0.01 or (bill.payment_status in ['partial', 'unpaid'])
    
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(colors.HexColor('#111827'))
    c.drawString(342, 714, "Invoice No : ")
    inv_label_w = c.stringWidth("Invoice No : ", "Helvetica-Bold", 8.5)
    
    # Red Highlight for Invoice Number
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(colors.HexColor('#B91C1C'))
    c.drawString(342 + inv_label_w, 714, str(bill.invoice_number))
    
    c.setFillColor(colors.HexColor('#111827'))
    c.setFont("Helvetica-Bold", 8.0)
    c.drawString(342, 699, "Date & Time")
    c.setFont("Helvetica", 8.0)
    c.drawString(425, 699, f": {b_date_str}")
    
    c.setFont("Helvetica-Bold", 8.0)
    c.drawString(342, 685, "Payment Method")
    c.setFont("Helvetica", 8.0)
    c.drawString(425, 685, f": {p_method_str}")
    
    c.setFont("Helvetica-Bold", 8.0)
    c.drawString(342, 671, "Payment Status")
    if bill.payment_status == 'partial':
        c.setFont("Helvetica-Bold", 8.0)
        c.setFillColor(colors.HexColor('#B91C1C'))
        c.drawString(425, 671, f": PARTIAL (Due: Rs. {pending_amt:,.2f})")
    elif bill.payment_status == 'unpaid':
        c.setFont("Helvetica-Bold", 8.0)
        c.setFillColor(colors.HexColor('#B91C1C'))
        c.drawString(425, 671, f": FULL DUE (Due: Rs. {pending_amt:,.2f})")
    else:
        c.setFont("Helvetica-Bold", 8.0)
        c.setFillColor(colors.HexColor('#047857'))
        c.drawString(425, 671, f": PAID")
        
    c.setFont("Helvetica-Bold", 8.0)
    c.setFillColor(colors.HexColor('#111827'))
    c.drawString(342, 657, "Place of Supply")
    c.setFont("Helvetica", 8.0)
    c.drawString(425, 657, f": Jharkhand (20)")
    
    # Horizontal Divider 2
    c.setStrokeColor(colors.HexColor('#9CA3AF'))
    c.setLineWidth(0.7)
    c.line(x_left, sep2_y, x_right, sep2_y)
    
    # 4. Table Setup
    col_widths = [32.0, 110.0, 30.0, 56.0, 44.0, 58.0, 56.0, 56.0, 117.27]
    x_edges = [x_left]
    for w in col_widths:
        x_edges.append(x_edges[-1] + w)
        
    header_top = sep2_y
    header_h = 26.0
    header_bot = header_top - header_h
    
    # Fill Table Header Background
    c.setFillColor(colors.HexColor('#F3F4F6'))
    c.rect(x_left, header_bot, box_w, header_h, stroke=0, fill=1)
    
    headers = ["Sl. No", "Item Description", "Qty", "Weight (g)", "Purity", "Rate / g (₹)", "Making (₹)", "GST (₹)", "Amount (₹)"]
    for i, title in enumerate(headers):
        cx = (x_edges[i] + x_edges[i+1]) / 2.0
        draw_col_header(c, cx, header_bot + 9.0, title, font_size=8.0)
        
    # Table grid bottom limit (Totals box top - shortened particulars columns lines for better spacing)
    totals_top = 305.0
    
    # Draw Central Watermark inside grid area
    if os.path.exists(WATERMARK_PATH):
        wm_w = 340.0
        wm_h = 240.0
        wm_x = (page_w - wm_w) / 2.0
        wm_y = (header_bot + totals_top) / 2.0 - (wm_h / 2.0)
        c.drawImage(WATERMARK_PATH, wm_x, wm_y, width=wm_w, height=wm_h, mask='auto')
        
    # Draw Table Item Rows
    row_h = 24.0
    cur_y = header_bot
    
    for idx, it in enumerate(items, 1):
        row_bot = cur_y - row_h
        text_y = row_bot + 7.5
        
        # Horizontal row line
        c.setStrokeColor(colors.HexColor('#E5E7EB'))
        c.setLineWidth(0.6)
        c.line(x_left, row_bot, x_right, row_bot)
        
        # Sl. No
        c.setFont("Helvetica-Bold", 8.5)
        c.setFillColor(colors.HexColor('#111827'))
        c.drawCentredString((x_edges[0] + x_edges[1]) / 2.0, text_y, str(idx))
        
        # Item Description
        item_label = str(it.jewellery_name or it.item_name or "Item")[:28]
        item_has_hindi = any(ord(ch) > 127 for ch in item_label)
        c.setFont(dev_font if item_has_hindi else "Helvetica", 9.0)
        c.drawString(x_edges[1] + 6, text_y, item_label)
        c.setFont("Helvetica", 8.5)
        
        # Qty
        c.drawCentredString((x_edges[2] + x_edges[3]) / 2.0, text_y, str(it.quantity))
        
        # Weight (g)
        w_str = f"{it.weight:.2f}" if (it.weight and it.weight > 0) else "-"
        c.drawCentredString((x_edges[3] + x_edges[4]) / 2.0, text_y, w_str)
        
        # Purity
        is_silver = (getattr(it, 'jewellery', None) and getattr(it.jewellery, 'metal_type', '').lower() == 'silver') or it.purity == 0
        purity_str = "Silver" if is_silver else f"{it.purity:.1f}K" if (it.purity and it.purity > 0) else "-"
        c.drawCentredString((x_edges[4] + x_edges[5]) / 2.0, text_y, purity_str)
        
        # Rate / g
        rate_str = f"{it.rate_per_gram:,.2f}" if (it.rate_per_gram and it.rate_per_gram > 0) else "-"
        c.drawCentredString((x_edges[5] + x_edges[6]) / 2.0, text_y, rate_str)
        
        # Making (₹)
        making_str = f"{it.making_charges:,.2f}" if (it.making_charges and it.making_charges > 0) else "0.00"
        c.drawCentredString((x_edges[6] + x_edges[7]) / 2.0, text_y, making_str)
        
        # GST (₹)
        if getattr(bill, 'apply_gst', True):
            it_gst = it.gst_amount if (it.gst_amount and it.gst_amount > 0) else round(it.total_price * 0.03, 2)
        else:
            it_gst = 0.0
        c.drawCentredString((x_edges[7] + x_edges[8]) / 2.0, text_y, f"{it_gst:,.2f}")
        
        # Amount (₹)
        it_total = round(it.total_price + it_gst, 2)
        c.setFont("Helvetica-Bold", 9.0)
        c.drawRightString(x_edges[9] - 8, text_y, f"{it_total:,.2f}")
        
        cur_y = row_bot
        
    # Draw Continuous Vertical Gridlines all the way down to totals_top
    c.setStrokeColor(colors.HexColor('#9CA3AF'))
    c.setLineWidth(0.65)
    c.line(x_left, header_top, x_right, header_top)
    c.line(x_left, header_bot, x_right, header_bot)
    c.line(x_left, totals_top, x_right, totals_top)
    
    for edge in x_edges:
        c.line(edge, header_top, edge, totals_top)
        
    # 5. Totals Box (Right Aligned under Making / GST / Amount columns)
    x_tot_left = x_edges[6]  # Starts aligned with column 6
    x_tot_mid = x_edges[8]   # Split between label and value
    
    has_discount = getattr(bill, 'discount_amount', 0.0) and bill.discount_amount > 0
    t_row_h = 21.0
    h_highlight_row = 24.5
    
    # Rows: Subtotal, [Discount], GST, Total, Amount Paid, Rest Amount (Due)
    num_std_rows = 4 if has_discount else 3  # Subtotal, [Discount], GST, Amount Paid
    totals_box_h = (num_std_rows * t_row_h) + (h_highlight_row * 2)  # Total + Rest Amount
    totals_bot = totals_top - totals_box_h
    
    # Outer box border & column divider
    c.setStrokeColor(colors.HexColor('#9CA3AF'))
    c.setLineWidth(0.65)
    c.rect(x_tot_left, totals_bot, x_right - x_tot_left, totals_top - totals_bot, stroke=1, fill=0)
    c.line(x_tot_mid, totals_top, x_tot_mid, totals_bot)
    
    curr_t_y = totals_top
    
    # Row 1: Subtotal
    c.line(x_tot_left, curr_t_y - t_row_h, x_right, curr_t_y - t_row_h)
    c.setFont("Helvetica", 9.0)
    c.setFillColor(colors.HexColor('#111827'))
    c.drawString(x_tot_left + 8, curr_t_y - 14.5, "Subtotal")
    draw_currency(c, x_right - 8, curr_t_y - 14.5, bill.subtotal, font_size=9.0, bold=False, align="right")
    curr_t_y -= t_row_h
    
    # Optional Discount Row
    if has_discount:
        c.line(x_tot_left, curr_t_y - t_row_h, x_right, curr_t_y - t_row_h)
        disc_label = f"Discount ({bill.discount_percentage:.1f}%)" if getattr(bill, 'discount_percentage', 0) else "Discount"
        c.setFont("Helvetica", 9.0)
        c.drawString(x_tot_left + 8, curr_t_y - 14.5, disc_label)
        draw_currency(c, x_right - 8, curr_t_y - 14.5, -bill.discount_amount, font_size=9.0, bold=False, align="right")
        curr_t_y -= t_row_h
        
    # Row 2: GST
    c.line(x_tot_left, curr_t_y - t_row_h, x_right, curr_t_y - t_row_h)
    gst_label = "GST (3%)" if getattr(bill, 'apply_gst', True) else "GST (0%)"
    gst_val = bill.gst_amount if getattr(bill, 'apply_gst', True) else 0.0
    c.setFont("Helvetica", 9.0)
    c.drawString(x_tot_left + 8, curr_t_y - 14.5, gst_label)
    draw_currency(c, x_right - 8, curr_t_y - 14.5, gst_val, font_size=9.0, bold=False, align="right")
    curr_t_y -= t_row_h
    
    # Row 3: Total Amount (Highlighted in Champagne Beige)
    c.setFillColor(colors.HexColor('#F5EBE1'))
    c.rect(x_tot_left, curr_t_y - h_highlight_row, x_right - x_tot_left, h_highlight_row, stroke=0, fill=1)
    c.setStrokeColor(colors.HexColor('#9CA3AF'))
    c.setLineWidth(0.65)
    c.line(x_tot_left, curr_t_y - h_highlight_row, x_right, curr_t_y - h_highlight_row)
    c.line(x_tot_mid, curr_t_y, x_tot_mid, curr_t_y - h_highlight_row)
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(colors.HexColor('#111827'))
    c.drawString(x_tot_left + 8, curr_t_y - 16.0, "Total")
    draw_currency(c, x_right - 8, curr_t_y - 16.0, bill.total_amount, font_size=11.0, bold=True, align="right")
    curr_t_y -= h_highlight_row
    
    # Row 4: Amount Paid
    c.line(x_tot_left, curr_t_y - t_row_h, x_right, curr_t_y - t_row_h)
    c.setFont("Helvetica-Bold", 9.0)
    c.setFillColor(colors.HexColor('#111827'))
    c.drawString(x_tot_left + 8, curr_t_y - 14.5, "Amount Paid")
    draw_currency(c, x_right - 8, curr_t_y - 14.5, paid_amt, font_size=9.5, bold=True, align="right", color=colors.HexColor('#047857'))
    curr_t_y -= t_row_h
    
    # Row 5: Rest Amount (Due) / Balance Due (Highlighted)
    rest_bg = colors.HexColor('#FEE2E2') if is_due else colors.HexColor('#ECFDF5')
    rest_text_color = colors.HexColor('#B91C1C') if is_due else colors.HexColor('#047857')
    c.setFillColor(rest_bg)
    c.rect(x_tot_left, curr_t_y - h_highlight_row, x_right - x_tot_left, h_highlight_row, stroke=0, fill=1)
    c.setStrokeColor(colors.HexColor('#9CA3AF'))
    c.setLineWidth(0.65)
    c.line(x_tot_mid, curr_t_y, x_tot_mid, curr_t_y - h_highlight_row)
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(rest_text_color)
    due_label = "Rest Amount (Due)" if is_due else "Balance Due"
    c.drawString(x_tot_left + 8, curr_t_y - 16.0, due_label)
    if is_due:
        draw_currency(c, x_right - 8, curr_t_y - 16.0, pending_amt, font_size=11.0, bold=True, align="right", color=rest_text_color)
    else:
        draw_currency(c, x_right - 8, curr_t_y - 16.0, 0.0, font_size=10.0, bold=True, align="right", color=rest_text_color)
        
    # 5.1 Payment Receipts History Box (Left Aligned under grid)
    # Fetch all installments paid towards this bill
    db_payments = db.query(BillPayment).filter(BillPayment.bill_id == bill.id).order_by(BillPayment.payment_date.asc()).all()
    if not db_payments and paid_amt > 0:
        class SyntheticPayment:
            def __init__(self, amount, method, date, notes):
                self.amount = amount
                self.payment_method = method
                self.payment_date = date
                self.notes = notes
        db_payments = [SyntheticPayment(paid_amt, bill.payment_method or "cash", bill.bill_date or datetime.utcnow(), "Initial payment")]
        
    p_box_left = x_left  # 28.0
    p_box_right = x_tot_left - 10.0  # 348.0
    p_box_w = p_box_right - p_box_left  # 320.0
    
    # Columns in Payment History:
    # Col 0: Inst # (28 to 54) -> tighter 26pt width
    # Col 1: Date (54 to 146) -> 92pt width
    # Col 2: Mode (146 to 216) -> 70pt width
    # Col 3: Amount Paid (216 to 348) -> 132pt spacious width
    p_cols = [p_box_left, p_box_left + 26.0, p_box_left + 118.0, p_box_left + 188.0, p_box_right]
    
    p_title_h = 17.0
    p_hdr_h = 16.0
    p_row_h = 16.5 if len(db_payments) <= 3 else 14.0
    p_summary_h = 17.5
    
    num_p_rows = max(1, len(db_payments))
    pay_box_h = p_title_h + p_hdr_h + (num_p_rows * p_row_h) + p_summary_h
    pay_box_bot = totals_top - pay_box_h
    
    # Outer box border
    c.setStrokeColor(colors.HexColor('#9CA3AF'))
    c.setLineWidth(0.65)
    c.rect(p_box_left, pay_box_bot, p_box_w, pay_box_h, stroke=1, fill=0)
    
    # Title Bar
    c.setFillColor(colors.HexColor('#F3F4F6'))
    c.rect(p_box_left, totals_top - p_title_h, p_box_w, p_title_h, stroke=0, fill=1)
    c.setStrokeColor(colors.HexColor('#9CA3AF'))
    c.setLineWidth(0.65)
    c.line(p_box_left, totals_top - p_title_h, p_box_right, totals_top - p_title_h)
    
    c.setFont("Helvetica-Bold", 8.0)
    c.setFillColor(colors.HexColor('#1F2937'))
    c.drawString(p_box_left + 7, totals_top - 12.0, "PAYMENT RECEIPTS HISTORY (INSTALLMENTS)")
    
    # Header Row
    hdr_y = totals_top - p_title_h
    c.setFillColor(colors.HexColor('#F9FAFB'))
    c.rect(p_box_left, hdr_y - p_hdr_h, p_box_w, p_hdr_h, stroke=0, fill=1)
    c.setStrokeColor(colors.HexColor('#D1D5DB'))
    c.setLineWidth(0.5)
    c.line(p_box_left, hdr_y - p_hdr_h, p_box_right, hdr_y - p_hdr_h)
    
    # Vertical dividers for columns
    for pc in p_cols[1:-1]:
        c.line(pc, hdr_y, pc, pay_box_bot)
        
    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(colors.HexColor('#4B5563'))
    c.drawCentredString((p_cols[0] + p_cols[1]) / 2.0, hdr_y - 11.0, "Inst #")
    c.drawString(p_cols[1] + 5.0, hdr_y - 11.0, "Payment Date")
    c.drawString(p_cols[2] + 5.0, hdr_y - 11.0, "Mode")
    c.drawRightString(p_cols[4] - 6.0, hdr_y - 11.0, "Amount Paid (Rs.)")
    
    # Draw payment rows
    curr_p_y = hdr_y - p_hdr_h
    if db_payments:
        for idx, p in enumerate(db_payments, 1):
            row_b = curr_p_y - p_row_h
            # Divider line
            c.setStrokeColor(colors.HexColor('#E5E7EB'))
            c.setLineWidth(0.5)
            c.line(p_box_left, row_b, p_box_right, row_b)
            
            p_date_str = p.payment_date.strftime('%d %b %Y') if getattr(p, 'payment_date', None) else "-"
            p_mode_str = (getattr(p, 'payment_method', 'CASH') or 'CASH').upper()
            
            c.setFont("Helvetica-Bold", 8.0)
            c.setFillColor(colors.HexColor('#111827'))
            c.drawCentredString((p_cols[0] + p_cols[1]) / 2.0, row_b + 5.0, f"#{idx}")
            
            c.setFont("Helvetica", 8.5)
            c.drawString(p_cols[1] + 5.0, row_b + 5.0, p_date_str)
            
            # Badge for payment mode
            c.setFont("Helvetica-Bold", 7.5)
            c.setFillColor(colors.HexColor('#374151'))
            c.drawString(p_cols[2] + 5.0, row_b + 5.0, p_mode_str)
            
            # Amount
            draw_currency(c, p_cols[4] - 6.0, row_b + 5.0, float(p.amount or 0.0), font_size=8.5, bold=True, color=colors.HexColor('#047857'))
            
            curr_p_y = row_b
    else:
        row_b = curr_p_y - p_row_h
        c.setFont("Helvetica-Oblique", 7.5)
        c.setFillColor(colors.HexColor('#6B7280'))
        c.drawString(p_cols[1] + 5.0, row_b + 5.0, "No payments received yet (Full Due)")
        curr_p_y = row_b
        
    # Payment Summary Bottom Row (Total Amount Received)
    c.setFillColor(colors.HexColor('#ECFDF5'))
    c.rect(p_box_left, pay_box_bot, p_box_w, p_summary_h, stroke=0, fill=1)
    c.setStrokeColor(colors.HexColor('#9CA3AF'))
    c.setLineWidth(0.65)
    c.line(p_box_left, pay_box_bot + p_summary_h, p_box_right, pay_box_bot + p_summary_h)
    
    c.setFont("Helvetica-Bold", 8.0)
    c.setFillColor(colors.HexColor('#065F46'))
    c.drawString(p_box_left + 7.0, pay_box_bot + 5.5, "Total Amount Received")
    draw_currency(c, p_box_right - 6.0, pay_box_bot + 5.5, paid_amt, font_size=9.0, bold=True, color=colors.HexColor('#047857'))
    
    # 6. Bottom Info (Amount in words & Notes)
    content_bot = min(totals_bot, pay_box_bot)
    y_words = content_bot - 13.0
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(colors.HexColor('#111827'))
    c.drawString(28, y_words, "Amount in words : ")
    prefix_w = c.stringWidth("Amount in words : ", "Helvetica-Bold", 8.5)
    
    words_str = num_to_words_indian(bill.total_amount)
    c.setFont("Helvetica", 8.0)
    c.drawString(28 + prefix_w, y_words, words_str)
    
    if is_due:
        y_words_due = y_words - 13.0
        c.setFont("Helvetica-Bold", 8.5)
        c.setFillColor(colors.HexColor('#B91C1C'))
        c.drawString(28, y_words_due, "Rest Amount in words : ")
        p_due_w = c.stringWidth("Rest Amount in words : ", "Helvetica-Bold", 8.5)
        c.setFont("Helvetica", 8.0)
        c.drawString(28 + p_due_w, y_words_due, num_to_words_indian(pending_amt))
        c.setFillColor(colors.HexColor('#111827'))
        
    if bill.notes:
        y_notes = (y_words_due - 13.0) if is_due else (y_words - 13.0)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(28, y_notes, "Notes : ")
        notes_w = c.stringWidth("Notes : ", "Helvetica-Bold", 8.5)
        c.setFont("Helvetica", 8.0)
        c.drawString(28 + notes_w, y_notes, str(bill.notes))
        
    # 7. Footer
    # Left: Thank you for your purchase! (in elegant dark maroon italic with underline)
    c.setFont("Times-Italic", 12.5)
    c.setFillColor(colors.HexColor('#5C1D0E'))
    c.drawString(28, 96, "Thank you for your purchase!")
    c.setStrokeColor(colors.HexColor('#D1D5DB'))
    c.setLineWidth(0.6)
    c.line(28, 90, 185, 90)
    
    # Right: Authorised Signatory with line
    c.setStrokeColor(colors.HexColor('#6B7280'))
    c.setLineWidth(0.8)
    c.line(420, 100, 560, 100)
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(colors.HexColor('#1F2937'))
    c.drawCentredString(490, 86, "Authorised Signatory")
    
    # Very Bottom Center: —— A BOND FOR GENERATIONS ——
    c.setStrokeColor(colors.HexColor('#9CA3AF'))
    c.setLineWidth(0.6)
    c.line(160, 44, 230, 44)
    c.setFont("Helvetica", 7.5)
    c.setFillColor(colors.HexColor('#374151'))
    c.drawCentredString(297.6, 41, "A   B O N D   F O R   G E N E R A T I O N S")
    c.line(365, 44, 435, 44)
    
    # Finalize Page
    c.showPage()
    c.save()
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

@router.get("/dues")
async def get_customer_dues(
    search: str = "",
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    """Retrieve all customers who have pending or partial payments with invoice breakdowns"""
    unpaid_bills = db.query(Bill).filter(
        (Bill.payment_status.in_(["pending", "partial", "unpaid"])) |
        (Bill.pending_amount > 0.01)
    ).order_by(Bill.bill_date.desc()).all()
    
    customers_map = {}
    for bill in unpaid_bills:
        c = bill.customer
        if not c:
            continue
            
        if search:
            s = search.lower()
            if (s not in (c.name or "").lower() and 
                s not in (c.phone or "").lower() and 
                s not in (c.customer_id or "").lower() and 
                s not in (bill.invoice_number or "").lower()):
                continue

        if c.id not in customers_map:
            customers_map[c.id] = {
                "id": c.id,
                "customer_id": c.customer_id,
                "name": c.name,
                "phone": c.phone,
                "address": c.address or "",
                "email": c.email or "",
                "total_due": 0.0,
                "total_billed": 0.0,
                "total_paid": 0.0,
                "pending_invoices_count": 0,
                "bills": []
            }
        
        b_total = float(bill.total_amount or 0.0)
        b_paid = float(bill.paid_amount or 0.0)
        b_pending = float(bill.pending_amount if bill.pending_amount is not None else max(0.0, b_total - b_paid))
        if b_pending <= 0.01 and bill.payment_status != "paid":
            b_pending = max(0.0, b_total - b_paid)
            
        customers_map[c.id]["total_due"] += b_pending
        customers_map[c.id]["total_billed"] += b_total
        customers_map[c.id]["total_paid"] += b_paid
        customers_map[c.id]["pending_invoices_count"] += 1
        
        customers_map[c.id]["bills"].append({
            "id": bill.id,
            "invoice_number": bill.invoice_number,
            "bill_date": bill.bill_date.isoformat() if bill.bill_date else None,
            "total_amount": round(b_total, 2),
            "paid_amount": round(b_paid, 2),
            "pending_amount": round(b_pending, 2),
            "payment_status": bill.payment_status,
            "payment_method": bill.payment_method
        })
        
    dues_list = list(customers_map.values())
    for d in dues_list:
        d["total_due"] = round(d["total_due"], 2)
        d["total_billed"] = round(d["total_billed"], 2)
        d["total_paid"] = round(d["total_paid"], 2)
        
    # Sort descending by total due
    dues_list.sort(key=lambda x: x["total_due"], reverse=True)
    
    total_shop_due = sum(d["total_due"] for d in dues_list)
    total_pending_bills = sum(d["pending_invoices_count"] for d in dues_list)
    
    return {
        "summary": {
            "total_outstanding_due": round(total_shop_due, 2),
            "total_due_customers": len(dues_list),
            "total_pending_invoices": total_pending_bills
        },
        "customers": dues_list
    }

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
    generate_pdf_invoice(bill_id, db)
    
    return FileResponse(pdf_path, filename=f"{bill.invoice_number}.pdf")