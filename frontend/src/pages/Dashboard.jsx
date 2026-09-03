import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useCachedApi, getCachedData, setCachedData } from '../utils/cache';
import { CardSkeleton, TableSkeleton } from '../components/Skeleton';
import { 
  FiUsers, 
  FiBox, 
  FiFileText, 
  FiDollarSign,
  FiTrendingUp,
  FiClock,
  FiArrowUpRight,
  FiPlusCircle,
  FiRefreshCw
} from 'react-icons/fi';
import { IoDiamondOutline } from 'react-icons/io5';

const Dashboard = () => {
  const [stats, setStats] = useState(() => getCachedData('/dashboard/stats') || null);
  const [loading, setLoading] = useState(() => !getCachedData('/dashboard/stats'));
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async (isBg = false) => {
    if (isBg) setIsValidating(true);
    else if (!stats) setLoading(true);

    try {
      // First try aggregated fast endpoint
      let data = null;
      try {
        const res = await api.get('/dashboard/stats');
        data = res.data;
      } catch (aggErr) {
        // Fallback to separate endpoints if backend hasn't been restarted yet
        const [customersRes, inventoryRes, billsRes, goldRateRes] = await Promise.allSettled([
          api.get('/customers/'),
          api.get('/inventory/'),
          api.get('/billing/?limit=5'),
          api.get('/gold-rate/')
        ]);

        const customers = customersRes.status === 'fulfilled' && Array.isArray(customersRes.value?.data)
          ? customersRes.value.data : [];
        const inventory = inventoryRes.status === 'fulfilled' && Array.isArray(inventoryRes.value?.data)
          ? inventoryRes.value.data : [];
        const bills = billsRes.status === 'fulfilled' && Array.isArray(billsRes.value?.data)
          ? billsRes.value.data : [];
        const goldRate = goldRateRes.status === 'fulfilled' && goldRateRes.value?.data
          ? goldRateRes.value.data : null;

        const revenue = bills.reduce((sum, bill) => sum + (Number(bill.total_amount) || 0), 0);

        data = {
          totalCustomers: customers.length,
          totalItems: inventory.length,
          totalBills: bills.length,
          todayRevenue: revenue,
          recentBills: bills.slice(0, 5),
          goldRate
        };
      }

      setStats(data);
      setCachedData('/dashboard/stats', data);
      setError(null);
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
      setError(err);
    } finally {
      setLoading(false);
      setIsValidating(false);
    }
  }, [stats]);

  useEffect(() => {
    fetchStats(Boolean(stats));
  }, []);

  const totalCustomers = stats?.totalCustomers ?? 0;
  const totalItems = stats?.totalItems ?? 0;
  const totalBills = stats?.totalBills ?? 0;
  const todayRevenue = stats?.todayRevenue ?? 0;
  const recentBills = stats?.recentBills || [];
  const goldRate = stats?.goldRate;

  const quickActions = [
    { 
      title: 'New Bill (POS)', 
      desc: 'Create customer invoice',
      icon: FiFileText, 
      path: '/billing',
      color: 'from-amber-500 to-amber-600',
      textColor: 'text-amber-500'
    },
    { 
      title: 'Add Jewellery', 
      desc: 'Stock in new items',
      icon: FiBox, 
      path: '/inventory',
      color: 'from-blue-500 to-indigo-600',
      textColor: 'text-blue-500'
    },
    { 
      title: 'Add Customer', 
      desc: 'Register new profile',
      icon: FiUsers, 
      path: '/customers',
      color: 'from-emerald-500 to-teal-600',
      textColor: 'text-emerald-500'
    },
    { 
      title: 'Update Rates', 
      desc: 'Daily Gold & Silver',
      icon: FiTrendingUp, 
      path: '/gold-rate',
      color: 'from-amber-600 to-yellow-500',
      textColor: 'text-amber-600'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Executive Dashboard</h1>
            {isValidating && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                <FiRefreshCw className="animate-spin text-[10px]" /> Syncing
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Overview of jewellery stock, daily sales, and metal valuations</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/80 font-medium">
            <FiClock className="mr-1.5 text-amber-600" />
            <span>{new Date().toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
          </div>
          <button
            onClick={() => fetchStats(false)}
            title="Refresh statistics"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition border border-slate-200/80"
          >
            <FiRefreshCw className={`w-4 h-4 ${isValidating ? 'animate-spin text-amber-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      {error && !stats ? (
        <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-rose-700">Unable to load dashboard statistics.</p>
          <p className="text-xs text-slate-500 mt-1">{error.message || 'Please check your connection and login status.'}</p>
          <button
            onClick={() => fetchStats(false)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <FiRefreshCw size={14} /> Retry Loading
          </button>
        </div>
      ) : loading && !stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Revenue */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-500/10 to-transparent rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Sales</span>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center font-bold">
                ₹
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                ₹{todayRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </h3>
              <p className="text-[11px] text-emerald-600 font-medium mt-1 flex items-center gap-1">
                <FiArrowUpRight /> Lifetime gross billing
              </p>
            </div>
          </div>

          {/* Card 2: Invoices */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-500/10 to-transparent rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Invoices Issued</span>
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 flex items-center justify-center">
                <FiFileText className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{totalBills}</h3>
              <p className="text-[11px] text-slate-500 font-medium mt-1">Processed transactions</p>
            </div>
          </div>

          {/* Card 3: Stock Items */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Stock Catalogue</span>
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center">
                <FiBox className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{totalItems}</h3>
              <p className="text-[11px] text-slate-500 font-medium mt-1">Unique jewellery models</p>
            </div>
          </div>

          {/* Card 4: Customers */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Client Directory</span>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center">
                <FiUsers className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{totalCustomers}</h3>
              <p className="text-[11px] text-slate-500 font-medium mt-1">Registered clients</p>
            </div>
          </div>
        </div>
      )}

      {/* Gold & Silver Live Snapshot Widget */}
      {goldRate && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-slate-50 border border-amber-300/60 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30">
                <IoDiamondOutline className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  Precious Metal Market Benchmarks
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    Active Rates
                  </span>
                </h2>
                <p className="text-xs text-slate-500">Live base prices used for automatic billing calculations</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white/80 backdrop-blur rounded-xl p-3 border border-amber-200/80">
                <span className="text-[11px] font-semibold text-amber-800 block">Gold 24K (Pure)</span>
                <span className="text-base font-bold text-slate-900">₹{goldRate.gold_rate_24k?.toLocaleString('en-IN')}<span className="text-[10px] text-slate-500 font-normal">/g</span></span>
              </div>
              <div className="bg-white/80 backdrop-blur rounded-xl p-3 border border-amber-200/80">
                <span className="text-[11px] font-semibold text-amber-800 block">Gold 22K (916)</span>
                <span className="text-base font-bold text-slate-900">₹{goldRate.gold_rate_22k?.toLocaleString('en-IN')}<span className="text-[10px] text-slate-500 font-normal">/g</span></span>
              </div>
              <div className="bg-white/80 backdrop-blur rounded-xl p-3 border border-amber-200/80">
                <span className="text-[11px] font-semibold text-amber-800 block">Gold 18K (750)</span>
                <span className="text-base font-bold text-slate-900">₹{goldRate.gold_rate_18k?.toLocaleString('en-IN')}<span className="text-[10px] text-slate-500 font-normal">/g</span></span>
              </div>
              <div className="bg-white/80 backdrop-blur rounded-xl p-3 border border-slate-200/80">
                <span className="text-[11px] font-semibold text-slate-700 block">Silver (999)</span>
                <span className="text-base font-bold text-slate-900">₹{goldRate.silver_rate?.toLocaleString('en-IN')}<span className="text-[10px] text-slate-500 font-normal">/g</span></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Launchpad */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action, index) => (
            <Link
              key={index}
              to={action.path}
              className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-amber-500/40 transition-all flex items-center gap-3.5 group"
            >
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${action.color} text-white flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105`}>
                <action.icon size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-800 group-hover:text-amber-600 transition-colors">
                  {action.title}
                </h3>
                <p className="text-xs text-slate-400 truncate">{action.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Bills Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Recent Invoices</h2>
            <p className="text-xs text-slate-500">Latest transactions generated in POS</p>
          </div>
          <Link
            to="/customer-history"
            className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1 transition"
          >
            View all <FiArrowUpRight />
          </Link>
        </div>

        {recentBills.length === 0 ? (
          <div className="p-8 text-center">
            <FiFileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-600 font-medium">No invoices created yet</p>
            <Link
              to="/billing"
              className="inline-flex items-center gap-1 text-xs text-amber-600 font-semibold mt-2 hover:underline"
            >
              <FiPlusCircle /> Create your first invoice
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[11px] tracking-wider">
                  <th className="py-3 px-5">Invoice #</th>
                  <th className="py-3 px-5">Customer</th>
                  <th className="py-3 px-5">Date</th>
                  <th className="py-3 px-5">Amount</th>
                  <th className="py-3 px-5">Payment</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentBills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-3 px-5 font-semibold text-slate-800">
                      {bill.invoice_number}
                    </td>
                    <td className="py-3 px-5 text-slate-700">
                      {bill.customer_name}
                    </td>
                    <td className="py-3 px-5 text-slate-500">
                      {bill.bill_date ? new Date(bill.bill_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                    </td>
                    <td className="py-3 px-5 font-bold text-slate-900">
                      ₹{Number(bill.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                        bill.payment_status?.toLowerCase() === 'paid'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {bill.payment_status || 'paid'}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <Link
                        to={`/customer-history?customer_id=${bill.customer_id}`}
                        className="text-xs font-semibold text-amber-600 hover:text-amber-800 transition"
                      >
                        History →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;