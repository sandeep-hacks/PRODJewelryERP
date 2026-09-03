import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCachedApi } from '../utils/cache';
import { 
  FiHome, 
  FiUsers, 
  FiBox, 
  FiFileText, 
  FiDollarSign, 
  FiLogOut,
  FiMenu,
  FiX,
  FiPlusCircle,
  FiTrendingUp,
  FiShield
} from 'react-icons/fi';
import { IoDiamondOutline } from 'react-icons/io5';

const Layout = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Live gold rate in the header across all pages with 0ms cache load
  const { data: goldRate } = useCachedApi('/gold-rate/', { ttl: 60000 });

  const menuItems = [
    { path: '/', icon: FiHome, label: 'Dashboard' },
    { path: '/billing', icon: FiFileText, label: 'Billing & POS' },
    { path: '/inventory', icon: FiBox, label: 'Inventory' },
    { path: '/customers', icon: FiUsers, label: 'Customers' },
    { path: '/gold-rate', icon: FiDollarSign, label: 'Live Metal Rates' },
    { path: '/customer-history', icon: FiFileText, label: 'Purchase History' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Modern Sidebar */}
      <aside className={`
        fixed top-0 left-0 bottom-0 w-64 bg-slate-900 text-slate-200 z-50 transform transition-transform duration-300 ease-in-out flex flex-col border-r border-slate-800
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        {/* Brand Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
              <IoDiamondOutline className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="font-bold text-base text-white tracking-wide leading-tight">AURUM ERP</h1>
              <span className="text-[11px] font-medium text-amber-400/90 uppercase tracking-wider">Jewellery Suite</span>
            </div>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <FiX size={20} />
          </button>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Main Menu
          </div>
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `
                flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                ${isActive 
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-sm shadow-amber-500/5' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }
              `}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon className="text-lg shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User Card & Logout */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/30">
          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 font-semibold text-xs">
                AD
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold text-slate-200 truncate">Administrator</p>
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
            >
              <FiLogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 min-h-screen">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3">
            {/* Mobile Menu & Search/Title */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                aria-label="Open menu"
              >
                <FiMenu size={20} />
              </button>

              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Jewellery ERP</span>
                <span>/</span>
                <span className="text-slate-400">Store Management</span>
              </div>
            </div>

            {/* Live Metal Rates Ticker in Topbar */}
            <div className="flex items-center gap-3 sm:gap-5">
              {goldRate && (
                <div className="hidden md:flex items-center gap-3 bg-amber-50 border border-amber-200/80 rounded-full px-3.5 py-1.5 text-xs shadow-sm">
                  <span className="flex items-center gap-1 font-semibold text-amber-900">
                    <FiTrendingUp className="text-amber-600" />
                    <span>Gold 24K:</span>
                    <span className="text-amber-700 font-bold">₹{goldRate.gold_rate_24k?.toLocaleString('en-IN')}/g</span>
                  </span>
                  <span className="w-1 h-3 bg-amber-200 rounded-full"></span>
                  <span className="hidden lg:inline text-amber-900 font-semibold">
                    22K: <span className="text-amber-700 font-bold">₹{goldRate.gold_rate_22k?.toLocaleString('en-IN')}/g</span>
                  </span>
                  <span className="hidden lg:inline w-1 h-3 bg-amber-200 rounded-full"></span>
                  <span className="text-slate-700 font-semibold">
                    Silver: <span className="text-slate-800 font-bold">₹{goldRate.silver_rate?.toLocaleString('en-IN')}/g</span>
                  </span>
                </div>
              )}

              {/* Quick Action: New Bill */}
              <Link
                to="/billing"
                className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-medium text-xs rounded-xl shadow-sm shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <FiPlusCircle size={15} />
                <span>+ New Bill</span>
              </Link>
            </div>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 p-2.5 sm:p-5 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;