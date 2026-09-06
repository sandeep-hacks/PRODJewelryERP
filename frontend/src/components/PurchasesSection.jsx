import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { invalidateCache } from '../utils/cache';
import { 
  FiShoppingBag, 
  FiPlus, 
  FiTrash2, 
  FiSearch, 
  FiCalendar, 
  FiRefreshCw, 
  FiDollarSign, 
  FiX, 
  FiTruck, 
  FiCheckCircle 
} from 'react-icons/fi';

const PurchasesSection = () => {
  const [purchases, setPurchases] = useState([]);
  const [stats, setStats] = useState({ totalPurchases: 0, purchaseCount: 0 });
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(''); // '' = all time, 'today' = today, 'YYYY-MM-DD' = specific
  const [customDate, setCustomDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    supplier_name: '',
    item_name: '',
    quantity: 1,
    cost: '',
    purchase_date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const getActiveDateParam = useCallback(() => {
    if (dateFilter === 'today') {
      return new Date().toISOString().split('T')[0];
    }
    if (dateFilter === 'custom' && customDate) {
      return customDate;
    }
    return '';
  }, [dateFilter, customDate]);

  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    try {
      const activeDate = getActiveDateParam();
      const params = new URLSearchParams();
      if (activeDate) params.append('date_filter', activeDate);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const [listRes, statsRes] = await Promise.all([
        api.get(`/purchases/?${params.toString()}`),
        api.get(`/purchases/stats${activeDate ? `?date_filter=${activeDate}` : ''}`)
      ]);

      setPurchases(listRes.data || []);
      setStats(statsRes.data || { totalPurchases: 0, purchaseCount: 0 });
    } catch (err) {
      console.error('Error fetching purchases:', err);
      toast.error('Failed to load purchase records');
    } finally {
      setLoading(false);
    }
  }, [getActiveDateParam, searchQuery]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const handleRecordPurchase = async (e) => {
    e.preventDefault();
    if (!formData.supplier_name.trim()) {
      toast.error('Supplier name is required');
      return;
    }
    if (!formData.item_name.trim()) {
      toast.error('Item name is required');
      return;
    }
    const costVal = parseFloat(formData.cost);
    if (isNaN(costVal) || costVal <= 0) {
      toast.error('Please enter a valid purchase cost');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        supplier_name: formData.supplier_name.trim(),
        item_name: formData.item_name.trim(),
        quantity: parseInt(formData.quantity) || 1,
        cost: costVal,
        purchase_date: formData.purchase_date ? new Date(formData.purchase_date).toISOString() : new Date().toISOString(),
        notes: formData.notes.trim() || null
      };

      await api.post('/purchases/', payload);
      toast.success('Purchase recorded successfully');
      setShowModal(false);
      setFormData({
        supplier_name: '',
        item_name: '',
        quantity: 1,
        cost: '',
        purchase_date: new Date().toISOString().split('T')[0],
        notes: ''
      });

      // Invalidate caches so dashboard updates immediately
      invalidateCache('/dashboard');
      fetchPurchases();
    } catch (err) {
      console.error('Save purchase error:', err);
      toast.error(err.response?.data?.detail || 'Failed to record purchase');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this purchase entry?')) return;
    try {
      await api.delete(`/purchases/${id}`);
      toast.success('Purchase entry deleted');
      invalidateCache('/dashboard');
      fetchPurchases();
    } catch (err) {
      toast.error('Failed to delete purchase entry');
    }
  };

  return (
    <div className="space-y-5">
      {/* KPI Cards & Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Purchases Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Purchases</span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold">
              ₹
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
              ₹{Number(stats.totalPurchases || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {dateFilter === 'today' ? "Today's inward procurement" : dateFilter === 'custom' && customDate ? `Procurement on ${customDate}` : 'All-time inward procurement'}
            </p>
          </div>
        </div>

        {/* Purchase Orders Count */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Purchase Orders</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
              <FiTruck size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{stats.purchaseCount || 0}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Supplier entries logged</p>
          </div>
        </div>

        {/* Action Button Card */}
        <div className="bg-gradient-to-br from-amber-500/10 via-amber-400/5 to-white p-5 rounded-2xl border border-amber-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">Supplier Inward</span>
            <p className="text-xs text-slate-600 mt-1">Log bullion, raw metal, or jewellery purchases from karigars and vendors</p>
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="mt-3 flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs rounded-xl shadow-sm shadow-amber-500/20 transition-all active:scale-[0.98]"
          >
            <FiPlus size={15} />
            <span>+ Record New Purchase</span>
          </button>
        </div>
      </div>

      {/* Date Filter & Search Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Date Filter Tabs / Calendar Picker */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mr-1">
            <FiCalendar className="text-amber-600" />
            Date Filter:
          </span>

          <button
            type="button"
            onClick={() => { setDateFilter(''); setCustomDate(''); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              dateFilter === '' 
                ? 'bg-slate-900 text-white shadow-xs' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Time
          </button>

          <button
            type="button"
            onClick={() => { setDateFilter('today'); setCustomDate(''); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              dateFilter === 'today' 
                ? 'bg-slate-900 text-white shadow-xs' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Today
          </button>

          <div className="flex items-center gap-1">
            <input
              type="date"
              value={customDate}
              onChange={(e) => {
                setCustomDate(e.target.value);
                setDateFilter('custom');
              }}
              className={`px-2.5 py-1 text-xs rounded-xl border transition outline-none font-medium ${
                dateFilter === 'custom' && customDate
                  ? 'bg-amber-50 border-amber-400 text-amber-900 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            />
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <FiSearch size={14} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search supplier or item..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 outline-none"
          />
        </div>
      </div>

      {/* Purchases Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Purchase History</h2>
            <p className="text-xs text-slate-500">Inward inventory and raw metal records</p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {purchases.length} record{purchases.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-600 mx-auto"></div>
            <p className="text-xs text-slate-400 mt-2 font-medium">Loading purchase records...</p>
          </div>
        ) : purchases.length === 0 ? (
          <div className="p-10 text-center">
            <FiShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-600 font-medium">No purchase records found</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {dateFilter ? 'Try clearing the date filter or recording a purchase' : 'Click "+ Record New Purchase" to log your first supplier purchase'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[11px] tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Supplier Name</th>
                  <th className="py-3 px-4">Item Description</th>
                  <th className="py-3 px-4 text-center">Qty</th>
                  <th className="py-3 px-4 text-right">Unit Cost</th>
                  <th className="py-3 px-4 text-right">Total Cost</th>
                  <th className="py-3 px-4">Notes</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchases.map((p) => {
                  const purchaseTotal = Number(p.total_cost || (p.quantity * p.cost) || 0);
                  const pDate = p.purchase_date ? new Date(p.purchase_date).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  }) : '-';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">
                        {pDate}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {p.supplier_name}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {p.item_name}
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-800">
                        {p.quantity}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600">
                        ₹{Number(p.cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        ₹{purchaseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-xs truncate max-w-[180px]" title={p.notes || ''}>
                        {p.notes || '-'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Delete purchase entry"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Purchase Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                  <FiTruck size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Record New Purchase</h3>
                  <p className="text-xs text-slate-500">Log inward inventory or bullion procurement</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <FiX size={18} />
              </button>
            </div>

            <form onSubmit={handleRecordPurchase} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier / Vendor Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.supplier_name}
                    onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                    placeholder="e.g. Shree Bullion Traders, Radha Jewellers..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Item / Material Description *</label>
                  <input
                    type="text"
                    required
                    value={formData.item_name}
                    onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                    placeholder="e.g. 24K Gold Bar 100g, 999 Silver Grain..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cost / Unit Rate (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Purchase Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.purchase_date}
                    onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 outline-none font-medium"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Calculated Total Cost:</span>
                <span className="text-base font-bold text-amber-700">
                  ₹{((parseInt(formData.quantity) || 1) * (parseFloat(formData.cost) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Inward Reference (Optional)</label>
                <textarea
                  rows="2"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Invoice number, purity test certificate, payment mode remarks..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl shadow-sm transition disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Purchase Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchasesSection;
