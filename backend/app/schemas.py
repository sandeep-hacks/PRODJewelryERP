from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

class CustomerBase(BaseModel):
    name: str
    phone: str
    address: Optional[str] = None
    email: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerResponse(CustomerBase):
    id: int
    customer_id: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class JewelleryItemBase(BaseModel):
    name: str
    metal_type: str
    purity: float
    weight: float
    stock_quantity: int
    making_charges: float
    wastage_percentage: float = 0
    description: Optional[str] = None
    image_url: Optional[str] = None

class JewelleryItemCreate(JewelleryItemBase):
    pass

class JewelleryItemResponse(JewelleryItemBase):
    id: int
    product_code: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class GoldRateBase(BaseModel):
    gold_rate_24k: float
    gold_rate_22k: float
    gold_rate_18k: float
    silver_rate: float

class GoldRateCreate(GoldRateBase):
    pass

class GoldRateResponse(GoldRateBase):
    id: int
    date: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class BillItemCreate(BaseModel):
    jewellery_id: int
    quantity: int = 1

class BillCreate(BaseModel):
    customer_id: int
    items: List[BillItemCreate]
    payment_status: str = "paid"
    payment_method: str = "cash"
    notes: Optional[str] = None

class BillItemResponse(BaseModel):
    id: int
    jewellery_id: int
    jewellery_name: Optional[str] = "Jewellery Item"
    quantity: int
    weight: float
    purity: float
    rate_per_gram: float
    making_charges: float
    wastage_charges: float
    gst_amount: float
    total_price: float
    
    class Config:
        from_attributes = True

class BillResponse(BaseModel):
    id: int
    invoice_number: str
    customer_id: int
    customer_name: Optional[str] = "Walk-in Customer"
    bill_date: datetime
    subtotal: float
    gst_amount: float
    total_amount: float
    payment_status: str
    payment_method: str
    items: List[BillItemResponse]
    
    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"