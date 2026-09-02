# Jewellery Shop ERP

A modern, full-stack Enterprise Resource Planning (ERP) application designed for jewellery businesses. Features real-time precious metal rate tracking, inventory management, customer profiles, instant bill generation with PDF invoice downloads, and financial reporting.

---

## 💎 Features

- **Dashboard**: High-level KPIs (Total Customers, Active Stock, Revenue, Recent Invoices) and real-time precious metal pricing.
- **Live Metal Rates**: Daily update of Gold 24K, 22K, 18K, and Silver prices with automatic calculation into item values.
- **Inventory Management**: Track jewellery items by purity, metal type, gross weight, making charges per gram, wastage %, and stock quantity.
- **Billing & Invoicing**: Fast invoice builder with automatic GST calculation, custom notes, payment status, and instant downloadable PDF invoices via ReportLab.
- **Customer Directory & Purchase History**: Maintain customer details and access all past bills and invoices per customer.
- **Authentication**: Secure JWT-based admin access.

---

## 🛠️ Tech Stack

- **Backend**: FastAPI (Python 3.13+ compatible), SQLAlchemy, SQLite / PostgreSQL, ReportLab, Pydantic v2.
- **Frontend**: React 18, Vite, Tailwind CSS, React Router v6, Axios, React Hot Toast, React Icons.

---

## 🚀 Quick Start (Local Development)

The fastest way to start both backend and frontend is using the unified run script:

```bash
chmod +x run.sh
./run.sh
```

- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **Backend API & Swagger Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### Default Login Credentials:
- **Username**: `admin`
- **Password**: `admin123`

---

## 📁 Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI application entry point & CORS
│   │   ├── database.py          # Database session & engine
│   │   ├── models.py            # SQLAlchemy models (Customer, Bill, Inventory, etc.)
│   │   ├── schemas.py           # Pydantic validation schemas
│   │   ├── auth.py              # JWT authentication & password hashing
│   │   └── routers/             # API routes (customers, inventory, billing, gold_rate)
│   ├── requirements.txt         # Python dependencies
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/               # Dashboard, Billing, Inventory, Customers, GoldRate, Login
│   │   ├── components/          # Layout, Sidebar, Navbar
│   │   ├── context/             # AuthContext state management
│   │   └── services/api.js      # Axios client with JWT interceptor
│   ├── package.json
│   └── vite.config.js
├── run.sh                       # One-click start script
└── README.md
```

---

## 🌐 Live Deployment Guide

### 1. Frontend (Vercel / Netlify)
- Set root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Environment Variable:
  - `VITE_API_URL`: URL of your live FastAPI backend (e.g. `https://api.yourdomain.com`)

### 2. Backend (Render / Railway / Fly.io / VPS)
- Set root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Environment Variables:
  - `DATABASE_URL`: Your PostgreSQL connection string
  - `SECRET_KEY`: A secure random JWT secret
  - `DEFAULT_ADMIN_PASSWORD`: Secure password for initial admin login
