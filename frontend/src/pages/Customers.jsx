import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useCachedApi, invalidateCache } from '../utils/cache';
import { useDebounce } from '../utils/useDebounce';
import { TableSkeleton } from '../components/Skeleton';
import { 
  FiSearch, 
  FiPlus, 
  FiPhone, 
  FiMapPin, 
  FiUser, 
  FiMail, 
  FiClock, 
  FiRefreshCw, 
  FiX,
  FiFileText,
  FiDownload
} from 'react-icons/fi';

const Customers = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Debounce search term
  const debouncedSearch = useDebounce(searchTerm, 250);

  const queryUrl = `/customers/?search=${encodeURIComponent(debouncedSearch)}`;
  const { data: rawCustomers, loading, isValidating, error, refetch } = useCachedApi(queryUrl, { ttl: 60000, initialData: [] });
  const customers = Array.isArray(rawCustomers) ? rawCustomers : [];

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    email: ''
  });

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      toast.loading('Generating customer Excel spreadsheet...', { id: 'export-toast' });
      
      const response = await api.get('/customers/export', { responseType: 'blob' });
      
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `Jewellery_Customers_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('Customer details downloaded successfully!', { id: 'export-toast' });
    } catch (err) {
      console.error('API export failed, falling back to client-side data:', err);
      if (customers && customers.length > 0) {
        const headers = ["Customer ID", "Customer Name", "Phone Number", "Email", "Address"];
        const rows = customers.map(c => [
          `"${c.customer_id || ''}"`,
          `"${(c.name || '').replace(/"/g, '""')}"`,
          `"'${c.phone || ''}"`,
          `"${(c.email || '').replace(/"/g, '""')}"`,
          `"${(c.address || '').replace(/"/g, '""')}"`
        ]);
        const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Jewellery_Customers_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Customer details downloaded in Excel format', { id: 'export-toast' });
      } else {
        toast.error('No customers found to export', { id: 'export-toast' });
      }
    } finally {
      setExporting(false);
    }
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      await api.post('/customers/', formData);
      toast.success('Customer profile created');
      setShowAddModal(false);
      setFormData({ name: '', phone: '', address: '', email: '' });
      invalidateCache('/customers');
      invalidateCache('/dashboard');
      refetch();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add customer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Customer Directory</h1>
            {isValidating && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                <FiRefreshCw className="animate-spin text-[10px]" /> Updating
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Manage customer accounts, contact details, and invoice history</p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:bg-emerald-200/80 border border-emerald-200 font-semibold text-xs sm:text-sm rounded-xl shadow-xs transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50"
            title="Download customer list as an Excel spreadsheet"
          >
            <FiDownload size={16} className={exporting ? 'animate-bounce text-emerald-600' : 'text-emerald-600'} />
            <span>{exporting ? 'Downloading...' : 'Download Excel'}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-medium text-xs sm:text-sm rounded-xl shadow-sm shadow-amber-500/20 transition-all hover:scale-[1.01] active:scale-[0.98]"
          >
            <FiPlus size={16} />
            <span>New Customer Profile</span>
          </button>
        </div>
      </div>


      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-3">
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <FiSearch size={16} />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
            placeholder="Search by customer name, phone number, or ID (e.g. CUST-001)..."
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              <FiX size={14} />
            </button>
          )}
        </div>

        <button
          onClick={() => refetch()}
          title="Refresh list"
          className="p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition border border-slate-200"
        >
          <FiRefreshCw size={15} className={isValidating ? 'animate-spin text-amber-600' : ''} />
        </button>
      </div>

      {/* Customer List */}
      {error && customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-rose-700">Failed to connect to database or retrieve customers.</p>
          <p className="text-xs text-slate-500 mt-1">{error.message || 'Please check your connection and login status.'}</p>
          <button
            onClick={() => refetch()}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <FiRefreshCw size={14} /> Retry Connection
          </button>
        </div>
      ) : loading && customers.length === 0 ? (
        <TableSkeleton rows={5} cols={5} />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          {customers.length === 0 ? (
            <div className="p-12 text-center">
              <FiUser className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-700">No customers found</h3>
              <p className="text-xs text-slate-400 mt-1">
                {searchTerm ? 'Try adjusting your search query.' : 'Add your first customer to start tracking purchases.'}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 text-white rounded-xl text-xs font-semibold hover:bg-amber-600 transition"
                >
                  <FiPlus size={14} /> Add Customer
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[11px] tracking-wider">
                    <th className="py-3 px-5">Customer ID</th>
                    <th className="py-3 px-5">Customer Name</th>
                    <th className="py-3 px-5">Phone Number</th>
                    <th className="py-3 px-5">Address</th>
                    <th className="py-3 px-5 text-right">Invoices</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition group">
                      <td className="py-3.5 px-5 font-mono text-[11px] font-semibold text-slate-600">
                        <span className="bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200">
                          {c.customer_id}
                        </span>
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-900 group-hover:text-amber-600 transition-colors">
                          {c.name}
                        </div>
                        {c.email && (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <FiMail className="text-[10px]" /> {c.email}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-slate-700 font-medium">
                        <div className="flex items-center gap-1.5">
                          <FiPhone className="text-slate-400 text-xs" />
                          <span>{c.phone}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-slate-500 max-w-xs truncate">
                        <div className="flex items-center gap-1.5">
                          <FiMapPin className="text-slate-400 text-xs shrink-0" />
                          <span className="truncate">{c.address || '—'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <Link
                          to={`/customer-history?customer_id=${c.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 rounded-xl transition"
                        >
                          <FiFileText size={13} />
                          <span>History</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">Add New Customer Profile</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <FiX size={18} />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                  placeholder="e.g. Priya Sharma"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                  placeholder="e.g. +91 98765 43210"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                  placeholder="priya@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Residential Address / City</label>
                <textarea
                  rows="2"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                  placeholder="Flat 204, Jewel Enclave, Mumbai..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl shadow-sm hover:from-amber-600 hover:to-amber-700 transition disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;