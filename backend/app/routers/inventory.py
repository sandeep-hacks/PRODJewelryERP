from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import uuid
import os
import base64
import urllib.request
import urllib.parse
import json
from ..database import get_db
from ..models import JewelleryItem
from ..schemas import JewelleryItemCreate, JewelleryItemResponse
from ..auth import verify_token

router = APIRouter(prefix="/inventory", tags=["inventory"])

UPLOAD_DIR = "uploads/products"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def generate_product_code():
    return f"PROD-{uuid.uuid4().hex[:8].upper()}"

@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    username: str = Depends(verify_token)
):
    content = await file.read()
    filename = file.filename or f"jewel_{uuid.uuid4().hex[:8]}.jpg"
    
    # 1. ImageKit Cloud Upload (RFC 7578 multipart/form-data)
    private_key = os.getenv("IMAGEKIT_PRIVATE_KEY", "private_c0UlgoVanFqKvHhb8p1vPZM2Xvw=")
    if private_key:
        try:
            auth_str = f"{private_key}:"
            b64_auth = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")
            
            boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"
            
            body_parts = [
                (
                    f"--{boundary}\r\n"
                    f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                    f"Content-Type: {file.content_type or 'application/octet-stream'}\r\n\r\n"
                ).encode("utf-8") + content + b"\r\n",
                (
                    f"--{boundary}\r\n"
                    f'Content-Disposition: form-data; name="fileName"\r\n\r\n'
                    f"{filename}\r\n"
                ).encode("utf-8"),
                (
                    f"--{boundary}\r\n"
                    f'Content-Disposition: form-data; name="folder"\r\n\r\n'
                    f"/jewellery-erp/\r\n"
                ).encode("utf-8"),
                f"--{boundary}--\r\n".encode("utf-8")
            ]
            
            body = b"".join(body_parts)
            upload_url = "https://upload.imagekit.io/api/v1/files/upload"
            
            req = urllib.request.Request(
                upload_url,
                data=body,
                headers={
                    "Authorization": f"Basic {b64_auth}",
                    "Content-Type": f"multipart/form-data; boundary={boundary}",
                    "Content-Length": str(len(body))
                },
                method="POST"
            )
            
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                cloud_url = data.get("url")
                if cloud_url:
                    return {
                        "url": cloud_url,
                        "thumbnailUrl": data.get("thumbnailUrl"),
                        "fileId": data.get("fileId"),
                        "storage": "imagekit"
                    }
        except Exception as e:
            print(f"ImageKit upload warning: {e}. Falling back to local storage.")

    # 2. Local fallback if cloud request fails
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    local_name = f"{uuid.uuid4().hex[:8]}_{filename}"
    filepath = os.path.join(UPLOAD_DIR, local_name)
    with open(filepath, "wb") as f:
        f.write(content)
    
    # Return absolute URL so browser and frontend can load it directly
    return {
        "url": f"http://localhost:8000/uploads/products/{local_name}",
        "storage": "local"
    }

@router.post("/", response_model=JewelleryItemResponse)
async def create_jewellery_item(
    item: JewelleryItemCreate,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    try:
        # Generate unique product code
        code = generate_product_code()
        while db.query(JewelleryItem).filter(JewelleryItem.product_code == code).first():
            code = generate_product_code()

        db_item = JewelleryItem(
            product_code=code,
            name=item.name,
            metal_type=item.metal_type,
            purity=float(item.purity),
            weight=float(item.weight),
            stock_quantity=int(item.stock_quantity),
            making_charges=float(item.making_charges),
            wastage_percentage=float(item.wastage_percentage),
            description=item.description,
            image_url=item.image_url
        )
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item
    except Exception as e:
        db.rollback()
        print(f"Error creating jewellery item: {e}")
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")

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
    
    try:
        for key, value in item_update.dict().items():
            if hasattr(item, key):
                setattr(item, key, value)
        
        db.commit()
        db.refresh(item)
        return item
    except Exception as e:
        db.rollback()
        print(f"Error updating jewellery item: {e}")
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")

@router.delete("/{item_id}")
async def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    item = db.query(JewelleryItem).filter(JewelleryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    try:
        db.delete(item)
        db.commit()
        return {"message": "Item deleted successfully"}
    except Exception as e:
        db.rollback()
        print(f"Error deleting jewellery item: {e}")
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")