#!/usr/bin/env python3
import os
import sys
import glob

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(current_dir, "backend")
if os.path.exists(backend_dir):
    sys.path.insert(0, backend_dir)
else:
    sys.path.insert(0, current_dir)

from dotenv import load_dotenv

# Load environment variables
for env_file in [os.path.join(backend_dir, ".env"), os.path.join(current_dir, ".env")]:
    if os.path.exists(env_file):
        load_dotenv(env_file)
        break

try:
    from app.database import SessionLocal, engine, Base
    from app.models import Admin, Customer, JewelleryItem, Bill, BillItem, BillPayment, Purchase, GoldRate
    from app.auth import get_password_hash
except ImportError:
    try:
        from backend.app.database import SessionLocal, engine, Base
        from backend.app.models import Admin, Customer, JewelleryItem, Bill, BillItem, BillPayment, Purchase, GoldRate
        from backend.app.auth import get_password_hash
    except ImportError as err:
        print(f"❌ Error importing database modules: {err}")
        sys.exit(1)

def clear_all_data():
    print("=" * 60)
    print("🧹 JEWELLERY ERP - FULL DATA CLEAN & RESET")
    print("=" * 60)
    
    db = SessionLocal()
    try:
        print("\n1. Clearing test records from database...")
        
        # 1. Delete in foreign key dependency order
        n_payments = db.query(BillPayment).delete()
        n_items = db.query(BillItem).delete()
        n_bills = db.query(Bill).delete()
        n_purchases = db.query(Purchase).delete()
        n_jewellery = db.query(JewelleryItem).delete()
        n_customers = db.query(Customer).delete()
        
        db.commit()
        
        print(f"   ✓ Deleted {n_payments} payment records")
        print(f"   ✓ Deleted {n_items} bill line items")
        print(f"   ✓ Deleted {n_bills} invoices/bills")
        print(f"   ✓ Deleted {n_purchases} purchase records")
        print(f"   ✓ Deleted {n_jewellery} inventory products")
        print(f"   ✓ Deleted {n_customers} customer accounts")
        
        # 2. Reset / verify Admin credentials
        print("\n2. Ensuring fresh admin login account...")
        admin = db.query(Admin).filter(Admin.username == "admin").first()
        default_pwd = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")
        if not admin:
            admin = Admin(
                username="admin",
                password_hash=get_password_hash(default_pwd)
            )
            db.add(admin)
            print(f"   ✓ Created admin account: username='admin', password='{default_pwd}'")
        else:
            admin.password_hash = get_password_hash(default_pwd)
            print(f"   ✓ Preserved admin account (reset to password='{default_pwd}')")
            
        # 3. Setup clean default Gold and Silver rates
        print("\n3. Setting fresh live Gold & Silver rates...")
        db.query(GoldRate).delete()
        rate_24k = 7250.0
        rate_22k = round(rate_24k * 22.0 / 24.0, 2)
        rate_18k = round(rate_24k * 18.0 / 24.0, 2)
        silver_rate = 92.0
        default_rate = GoldRate(
            gold_rate_24k=rate_24k,
            gold_rate_22k=rate_22k,
            gold_rate_18k=rate_18k,
            silver_rate=silver_rate
        )
        db.add(default_rate)
        db.commit()
        print(f"   ✓ Initialized 24K: ₹{rate_24k}/g | 22K: ₹{rate_22k}/g | 18K: ₹{rate_18k}/g | Silver: ₹{silver_rate}/g")

        
        # 4. Remove generated test invoice PDFs
        print("\n4. Cleaning generated test invoice PDFs...")
        inv_dir = os.path.join(backend_dir, "invoices") if os.path.exists(backend_dir) else "invoices"
        pdf_count = 0
        if os.path.exists(inv_dir):
            for pdf_path in glob.glob(os.path.join(inv_dir, "*.pdf")):
                try:
                    os.remove(pdf_path)
                    pdf_count += 1
                except Exception as e:
                    print(f"   ⚠️ Could not delete {pdf_path}: {e}")
        print(f"   ✓ Removed {pdf_count} test PDF invoice files from '{inv_dir}/'")
        
        # 5. Remove test product image uploads
        print("\n5. Cleaning uploaded test product images...")
        upload_dir = os.path.join(backend_dir, "uploads", "products") if os.path.exists(backend_dir) else "uploads/products"
        img_count = 0
        if os.path.exists(upload_dir):
            for file_path in glob.glob(os.path.join(upload_dir, "*")):
                if os.path.isfile(file_path):
                    try:
                        os.remove(file_path)
                        img_count += 1
                    except Exception as e:
                        print(f"   ⚠️ Could not delete {file_path}: {e}")
        print(f"   ✓ Removed {img_count} test uploaded images from '{upload_dir}/'")

        print("\n" + "=" * 60)
        print("✨ SUCCESS: All test data has been completely cleared!")
        print("   • Inventory: 0 items (Fresh)")
        print("   • Customers: 0 customers (Fresh)")
        print("   • Invoices / Bills: 0 (Fresh)")
        print("   • Purchases: 0 (Fresh)")
        print("   • Admin Login: username 'admin', password 'admin123'")
        print("=" * 60 + "\n")
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ Error during cleanup: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    clear_all_data()
