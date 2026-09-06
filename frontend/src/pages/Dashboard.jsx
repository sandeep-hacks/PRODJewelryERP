import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useCachedApi, getCachedData, setCachedData } from '../utils/cache';
import { CardSkeleton } from '../components/Skeleton';
import { 
  FiUsers, 
  FiBox, 
  FiFileText, 
  FiDollarSign,
  FiTrendingUp,
  FiClock,
  FiArrowUpRight,
  FiPlusCircle,
  FiRefreshCw,
  FiCalendar,
  FiShoppingBag,
  FiTruck,
  FiCheckCircle,
  FiArrowDownRight
} from 'react-icons/fi';
import { IoDiamondOutline } from 'react-icons/io5';

const Dashboard = () => {
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'today', 'custom'
  const [customDate, setCustomDate] = useState('');
  const [stats, setStats] = useState(() => getCachedData('/dashboard/stats') || null);
  const [loading, setLoading] = useState(() => !getCachedData('/dashboard/stats'));
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState(null);

  const getActiveDateString = useCallback((mode, cDate) => {
    if (mode === 'today') {
      return new Date().toISOString().split('T')[0];
    }
    if (mode === 'custom' && cDate) {
      return cDate;
    }
    return '';
  }, []);

  const fetchStats = useCallback(async (mode = filterMode, cDate = customDate, isBg = false) => {
    if (isBg) {
      setIsValidating(true);
    } else {
      setLoading(true);
    }

    const dateParam = getActiveDateString(mode, cDate);
    const url = `/dashboard/stats${dateParam ? `?date=${dateParam}` : ''}`;

    // Instant SWR check: if already in cache for this date filter, display immediately
    const cachedEntry = getCachedData(url);
    if (cachedEntry) {
      setStats(cachedEntry);
      setLoading(false);
      setIsValidating(true);
    }

    try {
      let data = null;
      try {
        const res = await api.get(url);
        data = res.data;
      } catch (aggErr) {
        // Fallback calculation if server doesn't have aggregate endpoint
        const [customersRes, inventoryRes, billsRes, purchasesRes, goldRateRes] = await Promise.allSettled([
          api.get('/customers/'),
          api.get('/inventory/'),
          api.get('/billing/'),
          api.get('/purchases/'),
          api.get('/gold-rate/')
        ]);

        const customers = customersRes.status === 'fulfilled' && Array.isArray(customersRes.value?.data)
          ? customersRes.value.data : [];
        const inventory = inventoryRes.status === 'fulfilled' && Array.isArray(inventoryRes.value?.data)
          ? inventoryRes.value.data : [];
        let bills = billsRes.status === 'fulfilled' && Array.isArray(billsRes.value?.data)
          ? billsRes.value.data : [];
        let purchases = purchasesRes.status === 'fulfilled' && Array.isArray(purchasesRes.value?.data)
          ? purchasesRes.value.data : [];
        const goldRate = goldRateRes.status === 'fulfilled' && goldRateRes.value?.data
          ? goldRateRes.value.data : null;

        if (dateParam) {
          bills = bills.filter(b => b.bill_date && b.bill_date.startsWith(dateParam));
          purchases = purchases.filter(p => p.purchase_date && p.purchase_date.startsWith(dateParam));
        }

        const totalSales = bills.reduce((sum, bill) => sum + (Number(bill.total_amount) || 0), 0);
        const totalPurchases = purchases.reduce((sum, p) => sum + (Number(p.total_cost) || (Number(p.quantity) * Number(p.cost)) || 0), 0);
        const netRevenue = totalSales - totalPurchases;

        data = {
          totalCustomers: customers.length,
          totalItems: inventory.length,
          totalBills: bills.length,
          totalSales: totalSales,
          todayRevenue: totalSales,
          totalPurchases: totalPurchases,
          purchaseCount: purchases.length,
          netRevenue: netRevenue,
          recentBills: bills.slice(0, 10),
          goldRate,
          filterDate: dateParam
        };
      }

      setStats(data);
      setCachedData(url, data);
      setError(null);
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
      setError(err);
    } finally {
      setLoading(false);
      setIsValidating(false);
    }
  }, [filterMode, customDate, getActiveDateString]);

  useEffect(() => {
    fetchStats(filterMode, customDate, Boolean(stats));
  }, [filterMode, customDate]);

  const totalCustomers = stats?.totalCustomers ?? 0;
  const totalItems = stats?.totalItems ?? 0;
  const totalBills = stats?.totalBills ?? 0;
  const totalSales = stats?.totalSales ?? stats?.todayRevenue ?? 0;
  const totalPurchases = stats?.totalPurchases ?? 0;
  const purchaseCount = stats?.purchaseCount ?? 0;
  const netRevenue = stats?.netRevenue ?? (totalSales - totalPurchases);
  const recentBills = stats?.recentBills || [];
  const goldRate = stats?.goldRate;

  // Filter label for subtitles
  const getFilterLabel = () => {
    if (filterMode === 'today') return "Today's sales";
    if (filterMode === 'custom' && customDate) return `Sales on ${customDate}`;
    return "All-time cumulative";
  };

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
      title: 'Record Purchase', 
      desc: 'Inward supplier stock',
      icon: FiTruck, 
      path: '/inventory?tab=purchases',
      color: 'from-blue-500 to-indigo-600',
      textColor: 'text-blue-500'
    },
    { 
      title: 'Jewellery Stock', 
      desc: 'Catalogue & items',
      icon: FiBox, 
      path: '/inventory',
      color: 'from-purple-500 to-indigo-600',
      textColor: 'text-purple-500'
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
      title: 'Live Metal Rates', 
      desc: 'Daily Gold & Silver',
      icon: FiTrendingUp, 
      path: '/gold-rate',
      color: 'from-amber-600 to-yellow-500',
      textColor: 'text-amber-600'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner & Date Filter */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Executive Dashboard</h1>
            {isValidating && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                <FiRefreshCw className="animate-spin text-[10px]" /> Syncing
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Real-time financials, sales, procurement, and net revenue valuation</p>
        </div>

        {/* Date Filter & Calendar Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="flex items-center bg-slate-50 p-1 rounded-xl border border-slate-200/80 text-xs">
            <button
              type="button"
              onClick={() => {
                setFilterMode('all');
                setCustomDate('');
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                filterMode === 'all'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterMode('today');
                setCustomDate('');
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                filterMode === 'today'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Today
            </button>
          </div>

          {/* Calendar Date Picker */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200/80">
            <FiCalendar className="text-amber-600 shrink-0" size={14} />
            <input
              type="date"
              value={customDate}
              onChange={(e) => {
                setCustomDate(e.target.value);
                setFilterMode('custom');
              }}
              className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer"
              title="Filter statistics by custom date"
            />
          </div>

          <button
            onClick={() => fetchStats(filterMode, customDate, false)}
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
            onClick={() => fetchStats(filterMode, customDate, false)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <FiRefreshCw size={14} /> Retry Loading
          </button>
        </div>
      ) : loading && !stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* Card 1: Total Sales */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-500/10 to-transparent rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Sales</span>
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center font-bold">
                ₹
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                ₹{Number(totalSales).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </h3>
              <p className="text-[11px] text-amber-700 font-medium mt-1 flex items-center gap-1">
                <FiArrowUpRight /> {totalBills} invoice{totalBills !== 1 ? 's' : ''} issued
              </p>
            </div>
          </div>

          {/* Card 2: Total Purchases */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Purchases</span>
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center">
                <FiTruck size={17} />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                ₹{Number(totalPurchases).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </h3>
              <p className="text-[11px] text-blue-700 font-medium mt-1 flex items-center gap-1">
                <FiArrowDownRight /> {purchaseCount} purchase order{purchaseCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Card 3: Net Revenue = Total Sales - Total Purchases */}
          <div className={`rounded-2xl border p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group ${
            netRevenue >= 0 
              ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-400/5 to-white border-emerald-300/80' 
              : 'bg-gradient-to-br from-rose-500/10 via-rose-400/5 to-white border-rose-300/80'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Net Revenue</span>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                netRevenue >= 0 
                  ? 'bg-emerald-500/20 text-emerald-700 border border-emerald-300' 
                  : 'bg-rose-500/20 text-rose-700 border border-rose-300'
              }`}>
                <FiTrendingUp size={16} />
              </div>
            </div>
            <div className="mt-3">
              <h3 className={`text-xl font-black tracking-tight ${netRevenue >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {netRevenue >= 0 ? '+' : ''}₹{Number(netRevenue).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </h3>
              <p className="text-[11px] font-semibold text-slate-500 mt-1">
                Sales − Purchases ({netRevenue >= 0 ? 'Surplus' : 'Deficit'})
              </p>
            </div>
          </div>

          {/* Card 4: Stock Items */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-500/10 to-transparent rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Catalogue Items</span>
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 flex items-center justify-center">
                <FiBox size={17} />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">{totalItems}</h3>
              <p className="text-[11px] text-slate-500 font-medium mt-1">Unique jewellery pieces</p>
            </div>
          </div>

          {/* Card 5: Customers */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-slate-500/10 to-transparent rounded-bl-full pointer-events-none transition-transform group-hover:scale-110"></div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Client Directory</span>
              <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center">
                <FiUsers size={17} />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">{totalCustomers}</h3>
              <p className="text-[11px] text-slate-500 font-medium mt-1">Registered customers</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {quickActions.map((action, index) => (
            <Link
              key={index}
              to={action.path}
              className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-amber-500/40 transition-all flex items-center gap-3.5 group"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.color} text-white flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105`}>
                <action.icon size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-slate-800 group-hover:text-amber-600 transition-colors">
                  {action.title}
                </h3>
                <p className="text-[11px] text-slate-400 truncate">{action.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Sales Invoices Section (Respects Date Filter) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Sales Invoices {filterMode === 'today' ? '(Today)' : filterMode === 'custom' && customDate ? `(${customDate})` : '(Recent)'}
            </h2>
            <p className="text-xs text-slate-500">
              {getFilterLabel()} • {totalBills} invoice{totalBills !== 1 ? 's' : ''}
            </p>
          </div>
          <Link
            to="/customer-history"
            className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1 transition"
          >
            Full Ledger <FiArrowUpRight />
          </Link>
        </div>

        {recentBills.length === 0 ? (
          <div className="p-8 text-center">
            <FiFileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-600 font-medium">No invoices found for this date</p>
            <p className="text-xs text-slate-400 mt-1">
              {filterMode !== 'all' ? 'Try changing the date filter or create a new invoice' : 'No transactions recorded yet'}
            </p>
            <Link
              to="/billing"
              className="inline-flex items-center gap-1 text-xs text-amber-600 font-semibold mt-3 hover:underline"
            >
              <FiPlusCircle /> Create new invoice
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
                      <div>₹{Number(bill.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                      {Number(bill.pending_amount || 0) > 0 && (
                        <div className="text-[10px] font-medium text-rose-600">
                          Due: ₹{Number(bill.pending_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                        bill.payment_status?.toLowerCase() === 'paid'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : bill.payment_status?.toLowerCase() === 'partial'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {bill.payment_status?.toLowerCase() === 'partial'
                          ? `Partial (₹${Number(bill.pending_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Due)`
                          : bill.payment_status || 'paid'}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <Link
                        to={`/customer-history?customer_id=${bill.customer_id}`}
                        className="text-xs font-semibold text-amber-600 hover:text-amber-800 transition inline-flex items-center gap-1"
                      >
                        {Number(bill.pending_amount || 0) > 0 ? 'Collect Due →' : 'Ledger →'}
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