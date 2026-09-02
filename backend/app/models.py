from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class Customer(Base):
    __tablename__ = "customers"
    
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(String, unique=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False, index=True)
    address = Column(Text)
    email = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    bills = relationship("Bill", back_populates="customer")

class JewelleryItem(Base):
    __tablename__ = "jewellery_items"
    
    id = Column(Integer, primary_key=True, index=True)
    product_code = Column(String, unique=True, index=True)
    name = Column(String, nullable=False)
    metal_type = Column(String, nullable=False)  # Gold or Silver
    purity = Column(Float, nullable=False)  # e.g., 22 for 22K
    weight = Column(Float, nullable=False)  # in grams
    stock_quantity = Column(Integer, nullable=False)
    making_charges = Column(Float, nullable=False)  # per gram
    wastage_percentage = Column(Float, default=0)
    image_url = Column(String)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    bill_items = relationship("BillItem", back_populates="jewellery")

class GoldRate(Base):
    __tablename__ = "gold_rates"
    
    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, default=datetime.utcnow, unique=True)
    gold_rate_24k = Column(Float, nullable=False)
    gold_rate_22k = Column(Float, nullable=False)
    gold_rate_18k = Column(Float, nullable=False)
    silver_rate = Column(Float, nullable=False)
    updated_by = Column(String)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Bill(Base):
    __tablename__ = "bills"
    
    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, unique=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    bill_date = Column(DateTime, default=datetime.utcnow)
    subtotal = Column(Float, nullable=False)
    gst_amount = Column(Float, nullable=False)
    total_amount = Column(Float, nullable=False)
    payment_status = Column(String, default="paid")  # paid, partial, unpaid
    payment_method = Column(String, default="cash")
    notes = Column(Text)
    
    customer = relationship("Customer", back_populates="bills")
    items = relationship("BillItem", back_populates="bill")

    @property
    def customer_name(self):
        return self.customer.name if self.customer else "Walk-in Customer"

class BillItem(Base):
    __tablename__ = "bill_items"
    
    id = Column(Integer, primary_key=True, index=True)
    bill_id = Column(Integer, ForeignKey("bills.id"))
    jewellery_id = Column(Integer, ForeignKey("jewellery_items.id"))
    quantity = Column(Integer, default=1)
    weight = Column(Float, nullable=False)
    purity = Column(Float, nullable=False)
    rate_per_gram = Column(Float, nullable=False)
    making_charges = Column(Float, nullable=False)
    wastage_charges = Column(Float, default=0)
    gst_amount = Column(Float, default=0)
    total_price = Column(Float, nullable=False)
    
    bill = relationship("Bill", back_populates="items")
    jewellery = relationship("JewelleryItem", back_populates="bill_items")

    @property
    def jewellery_name(self):
        return self.jewellery.name if self.jewellery else "Jewellery Item"

class Admin(Base):
    __tablename__ = "admins"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)