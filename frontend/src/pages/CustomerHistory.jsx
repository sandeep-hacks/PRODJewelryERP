import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useCachedApi } from '../utils/cache';
import { useDebounce } from '../utils/useDebounce';
import { TableSkeleton } from '../components/Skeleton';
import { 
  FiSearch, 
  FiPrinter, 
  FiDownload, 
  FiUser, 
  FiPhone, 
  FiMapPin, 
  FiFileText,
  FiCalendar,
  FiCheckCircle,
  FiArrowLeft
} from 'react-icons/fi';

const CustomerHistory = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [bills, setBills] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 200);
  const { data: rawSearchResults } = useCachedApi(
    debouncedSearch ? `/customers/?search=${encodeURIComponent(debouncedSearch)}` : null,
    { enabled: Boolean(debouncedSearch), ttl: 30000, initialData: [] }
  );
  const searchResults = Array.isArray(rawSearchResults) ? rawSearchResults : [];

  useEffect(() => {
    const customerId = searchParams.get('customer_id');
    if (customerId) {
      fetchCustomerBills(customerId);
    }
  }, [searchParams]);

  const fetchCustomerBills = async (customerId) => {
    setLoading(true);
    try {
      const [customerResponse, billsResponse] = await Promise.all([
        api.get(`/customers/${customerId}`),
        api.get(`/customers/${customerId}/bills`)
      ]);
      
      setSelectedCustomer(customerResponse.data);
      setBills(billsResponse.data || []);
    } catch (error) {
      toast.error('Failed to fetch customer history');
    } finally {
      setLoading(false);
    }
  };

  const selectCustomer = (customer) => {
    setSearchParams({ customer_id: customer.id });
    setSelectedCustomer(customer);
    setSearchTerm('');
  };

  const handlePrintInvoice = async (billId, invoiceNum) => {
    try {
      const response = await api.get(`/billing/${billId}/pdf`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${invoiceNum || 'invoice'}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error('Failed to download invoice PDF');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Purchase History & Invoices</h1>
          <p className="text-xs text-slate-500 mt-0.5">Lookup customer ledger, previous gold transactions, and reprint tax invoices</p>
        </div>

        {selectedCustomer && (
          <button
            onClick={() => {
              setSelectedCustomer(null);
              setBills([]);
              setSearchParams({});
            }}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl transition"
          >
            <FiArrowLeft size={14} /> Change Customer
          </button>
        )}
      </div>

      {/* Customer Lookup Card */}
      {!selectedCustomer && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900">Find Customer Record</h2>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <FiSearch size={16} />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
              placeholder="Search by customer name, mobile number, or CUST ID..."
            />
          </div>

          {searchResults.length > 0 && (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl max-h-60 overflow-y-auto">
              {searchResults.map((cust) => (
                <div
                  key={cust.id}
                  onClick={() => selectCustomer(cust)}
                  className="p-3.5 hover:bg-slate-50 cursor-pointer transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 font-bold text-xs flex items-center justify-center">
                      <FiUser size={14} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{cust.name}</p>
                      <p className="text-[11px] text-slate-500">{cust.phone} • <span className="font-mono">{cust.customer_id}</span></p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-amber-600">View Invoices →</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selected Customer Profile Strip */}
      {selectedCustomer && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-slate-50 border border-amber-300/60 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-base shadow-sm">
              {selectedCustomer.name?.charAt(0)}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{selectedCustomer.name}</h2>
              <div className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1"><FiPhone size={12} /> {selectedCustomer.phone}</span>
                <span className="font-mono bg-white/80 px-2 py-0.5 rounded border border-amber-200">{selectedCustomer.customer_id}</span>
                {selectedCustomer.address && <span className="flex items-center gap-1"><FiMapPin size={12} /> {selectedCustomer.address}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/billing"
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-xl shadow-sm transition"
            >
              + Create New Bill
            </Link>
          </div>
        </div>
      )}

      {/* Invoices List */}
      {selectedCustomer && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Tax Invoices & Transaction History ({bills.length})
            </h3>
          </div>

          {loading ? (
            <TableSkeleton rows={4} cols={5} />
          ) : bills.length === 0 ? (
            <div className="p-12 text-center">
              <FiFileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-600">No bills found for this customer</p>
              <Link
                to="/billing"
                className="mt-2 inline-flex items-center text-xs font-semibold text-amber-600 hover:underline"
              >
                Create an invoice in Billing POS
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[11px] tracking-wider">
                    <th className="py-3 px-5">Invoice Number</th>
                    <th className="py-3 px-5">Bill Date</th>
                    <th className="py-3 px-5">Items Count</th>
                    <th className="py-3 px-5">Total Amount</th>
                    <th className="py-3 px-5">Payment Status</th>
                    <th className="py-3 px-5 text-right">PDF Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3.5 px-5 font-mono text-xs font-semibold text-slate-800">
                        {bill.invoice_number}
                      </td>
                      <td className="py-3.5 px-5 text-slate-600">
                        {bill.bill_date ? new Date(bill.bill_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className="py-3.5 px-5 text-slate-600 font-medium">
                        {bill.items?.length || 1} item(s)
                      </td>
                      <td className="py-3.5 px-5 font-bold text-slate-900">
                        ₹{Number(bill.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                          bill.payment_status?.toLowerCase() === 'paid'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {bill.payment_status || 'paid'}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          onClick={() => handlePrintInvoice(bill.id, bill.invoice_number)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition"
                        >
                          <FiDownload size={13} className="text-amber-600" />
                          <span>Download</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerHistory;