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
from ..invoice_assets import (
    HEADER_LOGO_PATH,
    WATERMARK_PATH,
    DIAMOND_ICON_PATH,
    generate_assets_if_needed,
    num_to_words_indian
)


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
            weight = float(item.weight or 0.0)
            purity = float(item.purity or 0.0)
            wastage_pct = float(item.wastage_percentage or 0.0)
            
            metal_type = (item.metal_type or "Gold").lower()
            is_gold = metal_type == "gold"
            base_rate = gold_rate.gold_rate_24k if is_gold else gold_rate.silver_rate
            purity_factor = (purity / 24.0) if is_gold else 1.0
            effective_rate = base_rate * purity_factor
            
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
                rate_to_store = float(item.rate or item.rate_per_gram or 0.0)
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
        
        # Calculate price based on metal type
        is_gold = jewellery.metal_type.lower() == "gold"
        if is_gold:
            rate_24k = gold_rate.gold_rate_24k
            purity_factor = jewellery.purity / 24.0
        else:
            rate_24k = gold_rate.silver_rate
            purity_factor = 1.0
        
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
    sep1_y = 746.0
    
    # 2a. Diamond Logo on top left
    if os.path.exists(DIAMOND_ICON_PATH):
        c.drawImage(DIAMOND_ICON_PATH, 36, 752, width=62, height=62, mask='auto')
        
    # 2b. Central Shop Header Name "श्रवण ज्वेलर्स" + Slogan
    if os.path.exists(HEADER_LOGO_PATH):
        header_w = 280.0
        header_h = 56.0
        c.drawImage(HEADER_LOGO_PATH, (page_w - header_w) / 2.0, 754, width=header_w, height=header_h, mask='auto')
        
    # 2c. Top Right Header text
    c.setFillColor(colors.HexColor('#111827'))
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(x_right - 14, 804, "INVOICE")
    c.setFont("Helvetica", 8.5)
    c.setFillColor(colors.HexColor('#374151'))
    c.drawRightString(x_right - 14, 789, "GSTIN : 36XXXXXXXX0X")
    c.drawRightString(x_right - 14, 775, "Mob : 7488468139")
    
    # Horizontal Divider 1
    c.setStrokeColor(colors.HexColor('#9CA3AF'))
    c.setLineWidth(0.7)
    c.line(x_left, sep1_y, x_right, sep1_y)
    
    # 3. Bill To / Invoice Details Box
    sep2_y = 668.0
    x_mid = 328.0
    
    # Vertical divider line
    c.setStrokeColor(colors.HexColor('#D1D5DB'))
    c.setLineWidth(0.7)
    c.line(x_mid, sep1_y, x_mid, sep2_y)
    
    # Customer Details (Left)
    cust_name = (customer.name if customer else "Walk-in Customer")
    cust_phone = (customer.phone if customer and customer.phone else "-")
    cust_id = (customer.customer_id if customer and customer.customer_id else "-")
    
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(colors.HexColor('#111827'))
    c.drawString(32, 730, "Bill To :")
    c.drawString(32, 715, cust_name)
    c.setFont("Helvetica", 8.5)
    c.drawString(32, 700, f"Phone : {cust_phone}")
    c.drawString(32, 685, f"Customer ID : {cust_id}")
    
    # Invoice Details (Right)
    b_date_str = bill.bill_date.strftime('%Y-%m-%d %H:%M') if bill.bill_date else datetime.now().strftime('%Y-%m-%d %H:%M')
    p_method_str = (bill.payment_method or "CASH").upper()
    p_status_str = (bill.payment_status or "PAID").upper()
    
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(colors.HexColor('#111827'))
    c.drawString(342, 730, "Invoice No : ")
    inv_label_w = c.stringWidth("Invoice No : ", "Helvetica-Bold", 8.5)
    
    # Red Highlight for Invoice Number
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(colors.HexColor('#B91C1C'))
    c.drawString(342 + inv_label_w, 730, str(bill.invoice_number))
    
    c.setFillColor(colors.HexColor('#111827'))
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(342, 715, "Date")
    c.setFont("Helvetica", 8.5)
    c.drawString(425, 715, f": {b_date_str}")
    
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(342, 700, "Payment Method")
    c.setFont("Helvetica", 8.5)
    c.drawString(425, 700, f": {p_method_str}")
    
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(342, 685, "Payment Status")
    c.setFont("Helvetica", 8.5)
    c.drawString(425, 685, f": {p_status_str}")
    
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
        draw_col_header(c, cx, header_bot + 9.5, title, font_size=7.5)
        
    # Table grid bottom limit (Totals box top)
    totals_top = 285.0
    
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
        
        # Horizontal row line
        c.setStrokeColor(colors.HexColor('#E5E7EB'))
        c.setLineWidth(0.6)
        c.line(x_left, row_bot, x_right, row_bot)
        
        text_y = row_bot + 8.0
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.HexColor('#111827'))
        
        # Sl. No
        c.drawCentredString((x_edges[0] + x_edges[1]) / 2.0, text_y, str(idx))
        
        # Item Description
        c.drawString(x_edges[1] + 6, text_y, str(it.jewellery_name)[:25])
        
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
    num_tot_rows = 4 if has_discount else 3
    totals_box_h = (num_tot_rows - 1) * t_row_h + 25.0
    totals_bot = totals_top - totals_box_h
    
    # Outer box & row lines
    c.setStrokeColor(colors.HexColor('#9CA3AF'))
    c.setLineWidth(0.65)
    c.rect(x_tot_left, totals_bot, x_right - x_tot_left, totals_top - totals_bot, stroke=1, fill=0)
    c.line(x_tot_mid, totals_top, x_tot_mid, totals_bot)
    
    # Highlight final Total row in champagne beige
    c.setFillColor(colors.HexColor('#F5EBE1'))
    c.rect(x_tot_left, totals_bot, x_right - x_tot_left, 25.0, stroke=0, fill=1)
    
    curr_t_y = totals_top
    
    # Row 1: Subtotal
    c.line(x_tot_left, curr_t_y - t_row_h, x_right, curr_t_y - t_row_h)
    c.setFont("Helvetica", 8.5)
    c.setFillColor(colors.HexColor('#111827'))
    c.drawString(x_tot_left + 8, curr_t_y - 14.5, "Subtotal")
    draw_currency(c, x_right - 8, curr_t_y - 14.5, bill.subtotal, font_size=8.5, bold=False, align="right")
    curr_t_y -= t_row_h
    
    # Optional Discount Row
    if has_discount:
        c.line(x_tot_left, curr_t_y - t_row_h, x_right, curr_t_y - t_row_h)
        disc_label = f"Discount ({bill.discount_percentage:.1f}%)" if getattr(bill, 'discount_percentage', 0) else "Discount"
        c.setFont("Helvetica", 8.5)
        c.drawString(x_tot_left + 8, curr_t_y - 14.5, disc_label)
        draw_currency(c, x_right - 8, curr_t_y - 14.5, -bill.discount_amount, font_size=8.5, bold=False, align="right")
        curr_t_y -= t_row_h
        
    # Row 2: GST
    c.line(x_tot_left, curr_t_y - t_row_h, x_right, curr_t_y - t_row_h)
    gst_label = "GST (3%)" if getattr(bill, 'apply_gst', True) else "GST (0%)"
    gst_val = bill.gst_amount if getattr(bill, 'apply_gst', True) else 0.0
    c.setFont("Helvetica", 8.5)
    c.drawString(x_tot_left + 8, curr_t_y - 14.5, gst_label)
    draw_currency(c, x_right - 8, curr_t_y - 14.5, gst_val, font_size=8.5, bold=False, align="right")
    curr_t_y -= t_row_h
    
    # Row 3: Total
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(colors.HexColor('#111827'))
    c.drawString(x_tot_left + 8, totals_bot + 7.5, "Total")
    draw_currency(c, x_right - 8, totals_bot + 7.5, bill.total_amount, font_size=10.5, bold=True, align="right")
    
    # 6. Bottom Info (Amount in words & Notes)
    y_words = 196.0
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(colors.HexColor('#111827'))
    c.drawString(28, y_words, "Amount in words : ")
    prefix_w = c.stringWidth("Amount in words : ", "Helvetica-Bold", 8)
    
    words_str = num_to_words_indian(bill.total_amount)
    c.setFont("Helvetica", 7.5)
    c.drawString(28 + prefix_w, y_words, words_str)
    
    if bill.notes:
        y_notes = y_words - 20.0
        c.setFont("Helvetica-Bold", 8)
        c.drawString(28, y_notes, "Notes : ")
        notes_w = c.stringWidth("Notes : ", "Helvetica-Bold", 8)
        c.setFont("Helvetica", 8)
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