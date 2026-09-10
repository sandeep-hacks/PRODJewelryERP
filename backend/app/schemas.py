from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List, Any
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
    metal_type: str = "Gold"
    purity: float = 22.0
    weight: float = 0.0
    stock_quantity: int = 1
    making_charges: float = 0.0
    wastage_percentage: float = 0.0
    description: Optional[str] = None
    image_url: Optional[str] = None

    @field_validator("weight", "purity", "making_charges", "wastage_percentage", mode="before")
    @classmethod
    def parse_float_fields(cls, v: Any) -> float:
        if v is None or v == "":
            return 0.0
        try:
            return float(v)
        except (ValueError, TypeError):
            return 0.0

    @field_validator("stock_quantity", mode="before")
    @classmethod
    def parse_int_fields(cls, v: Any) -> int:
        if v is None or v == "":
            return 0
        try:
            return int(float(v))
        except (ValueError, TypeError):
            return 0

    @field_validator("name", "metal_type", mode="before")
    @classmethod
    def parse_str_fields(cls, v: Any) -> str:
        if v is None:
            return ""
        return str(v).strip()

    @field_validator("description", "image_url", mode="before")
    @classmethod
    def empty_str_to_none(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        return s if s else None

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
    jewellery_id: Optional[int] = None
    is_manual: Optional[bool] = False
    name: Optional[str] = None
    quantity: int = 1
    metal_type: Optional[str] = "Gold"
    purity: Optional[float] = 22.0
    weight: Optional[float] = 0.0
    wastage_percentage: Optional[float] = 0.0
    rate: Optional[float] = None
    rate_per_gram: Optional[float] = None
    total: Optional[float] = None
    making_charges_type: Optional[str] = "fixed"  # 'fixed' (₹) or 'percentage' (%)
    making_charges_value: Optional[float] = None

class BillCreate(BaseModel):
    customer_id: int
    items: List[BillItemCreate]
    apply_gst: Optional[bool] = True
    discount_amount: Optional[float] = 0.0
    discount_percentage: Optional[float] = 0.0
    paid_amount: Optional[float] = None
    payment_status: str = "paid"
    payment_method: str = "cash"
    notes: Optional[str] = None

class BillItemResponse(BaseModel):
    id: int
    jewellery_id: Optional[int] = None
    item_name: Optional[str] = None
    is_manual: Optional[bool] = False
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

class BillPaymentCreate(BaseModel):
    amount: float
    payment_method: str = "cash"
    payment_date: Optional[datetime] = None
    notes: Optional[str] = None

class BillPaymentResponse(BaseModel):
    id: int
    bill_id: int
    amount: float
    payment_method: str
    payment_date: datetime
    notes: Optional[str] = None
    
    class Config:
        from_attributes = True

class BillResponse(BaseModel):
    id: int
    invoice_number: str
    customer_id: int
    customer_name: Optional[str] = "Walk-in Customer"
    bill_date: datetime
    subtotal: float
    discount_amount: Optional[float] = 0.0
    discount_percentage: Optional[float] = 0.0
    apply_gst: Optional[bool] = True
    gst_amount: float
    total_amount: float
    paid_amount: float = 0.0
    pending_amount: float = 0.0
    payment_status: str
    payment_method: str
    items: List[BillItemResponse]
    payments: Optional[List[BillPaymentResponse]] = []
    
    class Config:
        from_attributes = True

class PurchaseBase(BaseModel):
    supplier_name: str
    item_name: str
    quantity: int = 1
    cost: float
    purchase_date: Optional[datetime] = None
    notes: Optional[str] = None

class PurchaseCreate(PurchaseBase):
    pass

class PurchaseResponse(PurchaseBase):
    id: int
    total_cost: float
    created_at: datetime
    
    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"