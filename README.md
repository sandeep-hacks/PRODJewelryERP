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

## 🌐 Step-by-Step Production Hosting Guide

### 1. Deploying Backend to Render (https://render.com)
1. Push this repository to your GitHub.
2. Sign in to **Render** and click **New +** -> **Web Service**.
3. Connect your GitHub repository.
4. Configure service settings:
   - **Name**: `jewellery-erp-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Under **Environment Variables**, add the following:
   - `DATABASE_URL`: Your Neon PostgreSQL connection string
   - `SECRET_KEY`: `9dd1388bd86383719986c98409402e770897273bbb6d48122730c3d6e84e5574`
   - `DEFAULT_ADMIN_PASSWORD`: `admin123`
   - `IMAGEKIT_PUBLIC_KEY`: `public_Trj6QHIfE5icULrligCD5lRQf3o=`
   - `IMAGEKIT_PRIVATE_KEY`: `private_c0UlgoVanFqKvHhb8p1vPZM2Xvw=`
   - `PYTHON_VERSION`: `3.11.9`
6. Click **Create Web Service**.
7. Once deployed, copy your Render URL (e.g., `https://jewellery-erp-backend.onrender.com`).
   - You can test it by opening `https://jewellery-erp-backend.onrender.com/` in your browser. It will respond with `{"status": "online"}`.

---

### 2. Deploying Frontend to Vercel (https://vercel.com)
1. Sign in to **Vercel** and click **Add New** -> **Project**.
2. Import your GitHub repository.
3. In the project setup screen:
   - **Root Directory**: Click edit and select `frontend`.
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Under **Environment Variables**, add:
   - `VITE_API_URL`: Your Render backend URL (e.g. `https://jewellery-erp-backend.onrender.com` without trailing slash)
5. Click **Deploy**.
6. `vercel.json` is already pre-configured to handle single-page application (SPA) routing so refreshing pages like `/customers` or `/inventory` will work seamlessly.
