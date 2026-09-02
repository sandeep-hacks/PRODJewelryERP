from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import uuid
import os
from ..database import get_db
from ..models import JewelleryItem
from ..schemas import JewelleryItemCreate, JewelleryItemResponse
from ..auth import verify_token

router = APIRouter(prefix="/inventory", tags=["inventory"])

UPLOAD_DIR = "uploads/products"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def generate_product_code():
    return f"PROD-{uuid.uuid4().hex[:8].upper()}"

@router.post("/", response_model=JewelleryItemResponse)
async def create_jewellery_item(
    item: JewelleryItemCreate,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    db_item = JewelleryItem(
        product_code=generate_product_code(),
        name=item.name,
        metal_type=item.metal_type,
        purity=item.purity,
        weight=item.weight,
        stock_quantity=item.stock_quantity,
        making_charges=item.making_charges,
        wastage_percentage=item.wastage_percentage,
        description=item.description,
        image_url=item.image_url
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@router.get("/", response_model=List[JewelleryItemResponse])
async def get_inventory(
    search: str = "",
    metal_type: str = "",
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    query = db.query(JewelleryItem)
    if search:
        query = query.filter(
            (JewelleryItem.name.ilike(f"%{search}%")) |
            (JewelleryItem.product_code.ilike(f"%{search}%"))
        )
    if metal_type:
        query = query.filter(JewelleryItem.metal_type == metal_type)
    return query.all()

@router.get("/{item_id}", response_model=JewelleryItemResponse)
async def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    item = db.query(JewelleryItem).filter(JewelleryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

@router.put("/{item_id}", response_model=JewelleryItemResponse)
async def update_item(
    item_id: int,
    item_update: JewelleryItemCreate,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    item = db.query(JewelleryItem).filter(JewelleryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    for key, value in item_update.dict().items():
        setattr(item, key, value)
    
    db.commit()
    db.refresh(item)
    return item

@router.delete("/{item_id}")
async def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    item = db.query(JewelleryItem).filter(JewelleryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    db.delete(item)
    db.commit()
    return {"message": "Item deleted successfully"}