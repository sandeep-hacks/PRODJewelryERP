import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useCachedApi, invalidateCache } from '../utils/cache';
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
  FiArrowLeft,
  FiX,
  FiUsers,
  FiDollarSign,
  FiClock,
  FiPlusCircle,
  FiList,
  FiAlertCircle,
  FiCheck,
  FiChevronDown,
  FiChevronUp
} from 'react-icons/fi';

const ALPHABETS = ['ALL', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

const CustomerHistory = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [bills, setBills] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLetter, setSelectedLetter] = useState('ALL');
  const [loadingBills, setLoadingBills] = useState(false);
  const [activeTab, setActiveTab] = useState('dues'); // 'dues' or 'directory'
  const [duesSearch, setDuesSearch] = useState('');
  const [expandedCustomerIds, setExpandedCustomerIds] = useState({});

  // Installment payment modal state
  const [activePaymentBill, setActivePaymentBill] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Payment receipts history modal state
  const [viewHistoryBill, setViewHistoryBill] = useState(null);

  // Debounced search term for smooth searching
  const debouncedSearch = useDebounce(searchTerm, 200);
  const debouncedDuesSearch = useDebounce(duesSearch, 200);

  // Fetch all customers by default (or filtered by search query)
  const customersEndpoint = debouncedSearch
    ? `/customers/?search=${encodeURIComponent(debouncedSearch)}`
    : '/customers/';

  const { data: rawCustomers, loading: loadingCustomers } = useCachedApi(customersEndpoint, {
    ttl: 60000,
    initialData: []
  });

  const allCustomers = Array.isArray(rawCustomers) ? rawCustomers : [];

  // Fetch dues data
  const duesEndpoint = debouncedDuesSearch
    ? `/billing/dues?search=${encodeURIComponent(debouncedDuesSearch)}`
    : '/billing/dues';

  const { data: rawDues, loading: loadingDues, refetch: refetchDues } = useCachedApi(duesEndpoint, {
    ttl: 30000,
    initialData: { summary: { total_outstanding_due: 0, total_due_customers: 0, total_pending_invoices: 0 }, customers: [] }
  });

  const duesData = rawDues || { summary: { total_outstanding_due: 0, total_due_customers: 0, total_pending_invoices: 0 }, customers: [] };

  const toggleCustomerExpand = (custId) => {
    setExpandedCustomerIds(prev => ({
      ...prev,
      [custId]: !prev[custId]
    }));
  };

  const isAllExpanded = useMemo(() => {
    const list = duesData.customers || [];
    if (list.length === 0) return false;
    return list.every(c => expandedCustomerIds[c.id]);
  }, [duesData.customers, expandedCustomerIds]);

  const toggleAllExpand = () => {
    if (isAllExpanded) {
      setExpandedCustomerIds({});
    } else {
      const next = {};
      (duesData.customers || []).forEach(c => { next[c.id] = true; });
      setExpandedCustomerIds(next);
    }
  };

  // Filter & sort alphabetically (A to Z)
  const sortedAndFilteredCustomers = useMemo(() => {
    let list = [...allCustomers];

    // Alphabetical sort by customer name
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Filter by selected alphabet initial if not 'ALL'
    if (selectedLetter !== 'ALL') {
      list = list.filter(c => 
        c.name && c.name.trim().toUpperCase().startsWith(selectedLetter)
      );
    }

    return list;
  }, [allCustomers, selectedLetter]);

  useEffect(() => {
    const customerId = searchParams.get('customer_id');
    if (customerId) {
      fetchCustomerBills(customerId);
    }
  }, [searchParams]);

  const fetchCustomerBills = async (customerId) => {
    setLoadingBills(true);
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
      setLoadingBills(false);
    }
  };

  const selectCustomer = (customer) => {
    setSearchParams({ customer_id: customer.id });
    setSelectedCustomer(customer);
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

  const openPaymentModal = (bill) => {
    setActivePaymentBill(bill);
    setPaymentAmount(bill.pending_amount ? bill.pending_amount.toString() : '');
    setPaymentMethod('cash');
    setPaymentNotes('');
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!activePaymentBill) return;

    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid payment amount greater than zero');
      return;
    }

    if (amt > Number(activePaymentBill.pending_amount || 0) + 0.01) {
      toast.error(`Payment amount cannot exceed pending due of ₹${Number(activePaymentBill.pending_amount || 0).toLocaleString('en-IN')}`);
      return;
    }

    setRecordingPayment(true);
    try {
      await api.post(`/billing/${activePaymentBill.id}/payments`, {
        amount: amt,
        payment_method: paymentMethod,
        notes: paymentNotes || undefined
      });

      toast.success(`Payment of ₹${amt.toLocaleString('en-IN')} recorded successfully!`);
      setActivePaymentBill(null);
      setPaymentAmount('');
      setPaymentNotes('');

      // Refresh customer's bills if a customer is selected
      if (selectedCustomer) {
        await fetchCustomerBills(selectedCustomer.id);
      }
      refetchDues();
      invalidateCache('/billing/dues');
      invalidateCache('/billing');
      invalidateCache('/dashboard');
      invalidateCache('/customers');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to record payment');
    } finally {
      setRecordingPayment(false);
    }
  };

  const totalCustomerSpend = useMemo(() => {
    return bills.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0);
  }, [bills]);

  const totalCustomerPaid = useMemo(() => {
    return bills.reduce((sum, b) => sum + (Number(b.paid_amount) || 0), 0);
  }, [bills]);

  const totalCustomerPending = useMemo(() => {
    return bills.reduce((sum, b) => sum + (Number(b.pending_amount) || 0), 0);
  }, [bills]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Customer Invoices & Ledger</h1>
          <p className="text-xs text-slate-500 mt-0.5">Browse customer directory alphabetically, track dues, record installment receipts, and download tax invoices</p>
        </div>

        {selectedCustomer && (
          <button
            onClick={() => {
              setSelectedCustomer(null);
              setBills([]);
              setSearchParams({});
            }}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl transition shadow-xs"
          >
            <FiArrowLeft size={14} /> Back to All Customers
          </button>
        )}
      </div>

      {/* When NO customer is selected: Show Tabs for Dues vs Directory */}
      {!selectedCustomer && (
        <div className="space-y-5">
          {/* View Mode Switcher Tabs */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setActiveTab('dues')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'dues'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FiAlertCircle className={duesData?.summary?.total_due_customers > 0 ? 'text-amber-600' : 'text-slate-400'} size={15} />
                <span>Outstanding Dues</span>
                {duesData?.summary?.total_due_customers > 0 && (
                  <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-extrabold rounded-full">
                    {duesData.summary.total_due_customers}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('directory')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'directory'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FiUsers className="text-amber-600" size={15} />
                <span>All Customers & Invoices ({allCustomers.length})</span>
              </button>
            </div>

            {activeTab === 'dues' && (
              <button
                onClick={() => refetchDues()}
                title="Refresh dues data"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-semibold rounded-xl shadow-xs transition"
              >
                <FiClock size={13} className={loadingDues ? 'animate-spin text-amber-600' : ''} />
                <span>Refresh Dues</span>
              </button>
            )}
          </div>

          {/* TAB 1: OUTSTANDING DUES SECTION */}
          {activeTab === 'dues' && (
            <div className="space-y-5">
              {/* Summary Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Total Shop Outstanding Dues */}
                <div className="bg-gradient-to-br from-rose-500/10 via-amber-500/5 to-white p-5 rounded-2xl border border-rose-200/80 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">
                      Total Outstanding Due
                    </span>
                    <div className="text-2xl font-extrabold text-slate-900 mt-1">
                      ₹{Number(duesData.summary.total_outstanding_due || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">Total unpaid balance across all customer bills</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center font-bold shadow-md shadow-rose-500/20">
                    <FiDollarSign size={22} />
                  </div>
                </div>

                {/* Customers with Dues */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Customers with Dues
                    </span>
                    <div className="text-2xl font-extrabold text-slate-900 mt-1">
                      {duesData.summary.total_due_customers || 0}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">Accounts with partial or pending invoices</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                    <FiUsers size={22} />
                  </div>
                </div>

                {/* Pending Invoices */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Pending Invoices
                    </span>
                    <div className="text-2xl font-extrabold text-slate-900 mt-1">
                      {duesData.summary.total_pending_invoices || 0}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">Invoices with remaining balances</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                    <FiFileText size={22} />
                  </div>
                </div>
              </div>

              {/* Dues Search Bar & Expand All Controls */}
              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:max-w-md">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <FiSearch size={16} />
                  </div>
                  <input
                    type="text"
                    value={duesSearch}
                    onChange={(e) => setDuesSearch(e.target.value)}
                    className="w-full pl-10 pr-9 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
                    placeholder="Search due customer by name, mobile, or invoice #..."
                  />
                  {duesSearch && (
                    <button
                      onClick={() => setDuesSearch('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    >
                      <FiX size={14} />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between w-full sm:w-auto gap-3">
                  <span className="text-xs text-slate-500 font-medium">
                    Showing <b>{duesData.customers?.length || 0}</b> customer account{duesData.customers?.length !== 1 ? 's' : ''} with active dues
                  </span>

                  {duesData.customers?.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAllExpand}
                      className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-amber-700 bg-slate-100 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-lg transition shrink-0"
                    >
                      {isAllExpanded ? 'Collapse All' : 'Expand All'}
                    </button>
                  )}
                </div>
              </div>

              {/* Dues List or Empty State */}
              {loadingDues && (!duesData.customers || duesData.customers.length === 0) ? (
                <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-600 mx-auto"></div>
                  <p className="text-xs text-slate-400 mt-2 font-medium">Loading customer due balances...</p>
                </div>
              ) : !duesData.customers || duesData.customers.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                    <FiCheckCircle size={32} />
                  </div>
                  <h3 className="text-base font-bold text-slate-800">All Customer Accounts Clear!</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {duesSearch
                      ? `No pending due customers match "${duesSearch}". Try clearing your search.`
                      : 'There are currently no customers with pending or partial payments. All issued invoices have been settled in full.'}
                  </p>
                  {duesSearch && (
                    <button
                      type="button"
                      onClick={() => setDuesSearch('')}
                      className="text-xs font-semibold text-amber-600 hover:underline inline-block mt-2"
                    >
                      Clear search filter
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {duesData.customers.map((cust) => {
                    const initial = (cust.name || 'C').trim().charAt(0).toUpperCase();
                    const isExpanded = !!expandedCustomerIds[cust.id];
                    const billsCount = cust.bills?.length || 0;

                    return (
                      <div
                        key={cust.id}
                        className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${
                          isExpanded
                            ? 'border-amber-300 shadow-md ring-1 ring-amber-300/30'
                            : 'border-slate-200/80 hover:border-slate-300 shadow-xs hover:shadow-sm'
                        }`}
                      >
                        {/* Compact Clickable Customer Due Header */}
                        <div
                          onClick={() => toggleCustomerExpand(cust.id)}
                          className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-50/70 transition-colors"
                        >
                          {/* Left: Avatar + Details */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white font-extrabold text-sm sm:text-base flex items-center justify-center shrink-0 shadow-xs shadow-rose-500/20">
                              {initial}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">{cust.name}</h3>
                                <span className="text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200">
                                  {cust.customer_id}
                                </span>
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80">
                                  <FiFileText size={11} className="text-amber-600" />
                                  {billsCount} {billsCount === 1 ? 'Bill Partial' : 'Bills Partial'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap font-medium">
                                <span className="flex items-center gap-1">
                                  <FiPhone size={12} className="text-slate-400" />
                                  <span className="font-semibold text-slate-700">{cust.phone}</span>
                                </span>
                                {cust.address && (
                                  <span className="flex items-center gap-1 text-slate-400 truncate max-w-xs">
                                    <FiMapPin size={12} className="shrink-0" />
                                    <span className="truncate">{cust.address}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right: Due Amount & Action Buttons */}
                          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                            <div className="text-left sm:text-right px-3 py-1 bg-rose-50 rounded-xl border border-rose-200/80">
                              <span className="text-[9px] font-extrabold text-rose-800 uppercase tracking-wider block">
                                Total Balance Due
                              </span>
                              <span className="text-base sm:text-lg font-black text-rose-600 font-mono">
                                ₹{Number(cust.total_due).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectCustomer(cust);
                                }}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition flex items-center gap-1"
                                title="Open complete customer ledger and history"
                              >
                                <span>Ledger</span>
                                <span className="text-slate-400">→</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCustomerExpand(cust.id);
                                }}
                                className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition flex items-center gap-1.5 ${
                                  isExpanded
                                    ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                              >
                                <span>{isExpanded ? 'Hide Bills' : 'View Bills'}</span>
                                <FiChevronDown
                                  size={14}
                                  className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Expandable Unpaid / Partial Invoices Breakdown */}
                        {isExpanded && (
                          <div className="border-t border-slate-200 bg-slate-50/60">
                            <div className="px-4 py-2 bg-gradient-to-r from-amber-50/70 to-rose-50/40 border-b border-amber-100 flex items-center justify-between text-xs text-slate-600 font-medium flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                <span>Showing <b>{billsCount}</b> partial/pending invoice{billsCount !== 1 ? 's' : ''} for <b>{cust.name}</b></span>
                              </div>
                              <span className="text-[11px] text-slate-400">Click Collect Payment to record an installment</span>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                                    <th className="py-2.5 px-4">Invoice #</th>
                                    <th className="py-2.5 px-4">Date</th>
                                    <th className="py-2.5 px-4">Total Amount</th>
                                    <th className="py-2.5 px-4">Paid Amount</th>
                                    <th className="py-2.5 px-4 text-rose-600 font-bold">Due Balance</th>
                                    <th className="py-2.5 px-4">Status</th>
                                    <th className="py-2.5 px-4 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                  {cust.bills.map((b) => (
                                    <tr key={b.id} className="hover:bg-amber-50/30 transition">
                                      <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                                        {b.invoice_number}
                                      </td>
                                      <td className="py-2.5 px-4 text-slate-500">
                                        {b.bill_date ? new Date(b.bill_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                      </td>
                                      <td className="py-2.5 px-4 font-semibold text-slate-900">
                                        ₹{Number(b.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="py-2.5 px-4 text-emerald-700 font-semibold">
                                        ₹{Number(b.paid_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="py-2.5 px-4 text-rose-600 font-bold text-sm">
                                        ₹{Number(b.pending_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="py-2.5 px-4">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                          b.payment_status === 'partial'
                                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                                        }`}>
                                          {b.payment_status?.toUpperCase()}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-4 text-right">
                                        <div className="inline-flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => openPaymentModal(b)}
                                            className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-[11px] rounded-lg shadow-xs shadow-amber-500/20 transition flex items-center gap-1"
                                          >
                                            <FiDollarSign size={12} />
                                            <span>Collect Payment</span>
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => handlePrintInvoice(b.id, b.invoice_number)}
                                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
                                            title="Download Invoice PDF"
                                          >
                                            <FiDownload size={13} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ALL CUSTOMERS DIRECTORY */}
          {activeTab === 'directory' && (
            <div className="space-y-4">
              {/* Search Bar & Alphabet Indexer */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative w-full sm:max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <FiSearch size={16} />
                    </div>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
                      placeholder="Search customer by name, mobile number, or ID..."
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

                  <div className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
                    <FiUsers className="text-amber-600" />
                    <span>Showing {sortedAndFilteredCustomers.length} of {allCustomers.length} customer{allCustomers.length !== 1 ? 's' : ''} (A-Z)</span>
                  </div>
                </div>

                {/* Alphabetical A-Z Quick Filter Bar */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
                    {ALPHABETS.map((letter) => {
                      const isSelected = selectedLetter === letter;
                      return (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => setSelectedLetter(letter)}
                          className={`min-w-[28px] h-7 px-1.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/60'
                          }`}
                        >
                          {letter}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Customer Directory List / Grid */}
              {loadingCustomers && allCustomers.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-600 mx-auto"></div>
                  <p className="text-xs text-slate-400 mt-2 font-medium">Loading customer directory...</p>
                </div>
              ) : sortedAndFilteredCustomers.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center">
                  <FiUsers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No customers found</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {selectedLetter !== 'ALL' 
                      ? `No customer names begin with the letter "${selectedLetter}". Try clicking "ALL" or searching.` 
                      : searchTerm ? 'No matching customer names or numbers found.' : 'No customers registered yet.'}
                  </p>
                  {(selectedLetter !== 'ALL' || searchTerm) && (
                    <button
                      type="button"
                      onClick={() => { setSelectedLetter('ALL'); setSearchTerm(''); }}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:underline"
                    >
                      Clear filters & view all customers
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {sortedAndFilteredCustomers.map((cust) => {
                    const initial = (cust.name || 'C').trim().charAt(0).toUpperCase();
                    return (
                      <div
                        key={cust.id}
                        onClick={() => selectCustomer(cust)}
                        className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md hover:border-amber-400/80 transition-all cursor-pointer flex flex-col justify-between group"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs shadow-amber-500/20 group-hover:scale-105 transition-transform">
                                {initial}
                              </div>
                              <div className="min-w-0">
                                <h3 className="text-sm font-bold text-slate-900 group-hover:text-amber-600 transition-colors truncate">
                                  {cust.name}
                                </h3>
                                <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                                  <FiPhone size={11} className="text-slate-400" />
                                  <span>{cust.phone}</span>
                                </p>
                              </div>
                            </div>

                            <span className="text-[10px] font-mono font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                              {cust.customer_id}
                            </span>
                          </div>

                          {cust.address && (
                            <p className="text-[11px] text-slate-400 mt-2.5 flex items-center gap-1 line-clamp-1">
                              <FiMapPin size={11} className="shrink-0" />
                              <span className="truncate">{cust.address}</span>
                            </p>
                          )}
                        </div>

                        <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-[11px] text-slate-400">View Invoices</span>
                          <span className="font-semibold text-amber-600 group-hover:translate-x-0.5 transition-transform">
                            Open Ledger →
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected Customer Profile Strip */}
      {selectedCustomer && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-slate-50 border border-amber-300/60 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-base shadow-sm">
              {selectedCustomer.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{selectedCustomer.name}</h2>
              <div className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1 font-medium"><FiPhone size={12} /> {selectedCustomer.phone}</span>
                <span className="font-mono bg-white/80 px-2 py-0.5 rounded border border-amber-200 font-semibold">{selectedCustomer.customer_id}</span>
                {selectedCustomer.address && <span className="flex items-center gap-1"><FiMapPin size={12} /> {selectedCustomer.address}</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {/* Total Billed */}
            <div className="bg-white/90 border border-slate-200/80 px-3 py-2 rounded-xl text-right">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 block">Total Billed</span>
              <span className="text-sm sm:text-base font-bold text-slate-900">₹{totalCustomerSpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>

            {/* Total Paid */}
            <div className="bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl text-right">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 block">Total Paid</span>
              <span className="text-sm sm:text-base font-bold text-emerald-700">₹{totalCustomerPaid.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>

            {/* Pending / Due Balance */}
            <div className={`px-3 py-2 rounded-xl text-right border ${
              totalCustomerPending > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className={`text-[10px] uppercase tracking-wider font-semibold block ${
                totalCustomerPending > 0 ? 'text-rose-700' : 'text-slate-500'
              }`}>
                Pending Due
              </span>
              <span className={`text-sm sm:text-base font-bold ${
                totalCustomerPending > 0 ? 'text-rose-700' : 'text-slate-700'
              }`}>
                ₹{totalCustomerPending.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>

            <Link
              to="/billing"
              className="px-3.5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold rounded-xl shadow-sm transition self-stretch sm:self-auto flex items-center justify-center gap-1"
            >
              <FiPlusCircle size={14} /> New Bill
            </Link>
          </div>
        </div>
      )}

      {/* Invoices List */}
      {selectedCustomer && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Tax Invoices & Dues Ledger ({bills.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Click "+ Pay Due" on any pending invoice to record installment payments</p>
            </div>
            <span className="text-xs text-slate-500 font-medium">Customer ID: {selectedCustomer.customer_id}</span>
          </div>

          {loadingBills ? (
            <TableSkeleton rows={4} cols={7} />
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
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Items</th>
                    <th className="py-3 px-4 text-right">Total Bill</th>
                    <th className="py-3 px-4 text-right">Amount Paid</th>
                    <th className="py-3 px-4 text-right">Pending Due</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bills.map((bill) => {
                    const totalAmt = Number(bill.total_amount || 0);
                    const paidAmt = Number(bill.paid_amount || 0);
                    const pendingAmt = Number(bill.pending_amount || 0);
                    const isDue = pendingAmt > 0;
                    const paymentCount = bill.payments?.length || (paidAmt > 0 ? 1 : 0);

                    return (
                      <tr key={bill.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-800">
                          {bill.invoice_number}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          {bill.bill_date ? new Date(bill.bill_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 font-medium">
                          {bill.items?.length || 1} item(s)
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                          ₹{totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold text-emerald-700 whitespace-nowrap">
                          ₹{paidAmt.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold whitespace-nowrap">
                          {isDue ? (
                            <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                              ₹{pendingAmt.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">₹0 (Clear)</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                            bill.payment_status?.toLowerCase() === 'paid'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : bill.payment_status?.toLowerCase() === 'partial'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}>
                            {bill.payment_status || 'paid'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {/* Pay Due Button */}
                            {isDue && (
                              <button
                                onClick={() => openPaymentModal(bill)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
                                title="Record an installment payment for this bill"
                              >
                                <FiPlusCircle size={12} />
                                <span>Pay Due</span>
                              </button>
                            )}

                            {/* View Receipts History Button */}
                            {paymentCount > 0 && (
                              <button
                                onClick={() => setViewHistoryBill(bill)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition"
                                title="View payment installments breakdown"
                              >
                                <FiList size={12} className="text-slate-500" />
                                <span>Receipts ({paymentCount})</span>
                              </button>
                            )}

                            {/* PDF Invoice Button */}
                            <button
                              onClick={() => handlePrintInvoice(bill.id, bill.invoice_number)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition"
                              title="Download PDF Tax Invoice"
                            >
                              <FiDownload size={12} className="text-amber-600" />
                              <span>PDF</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Record Due Payment / Installment */}
      {activePaymentBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-50 to-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                  <FiDollarSign size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Record Due Payment</h3>
                  <p className="text-[11px] text-slate-500">
                    Invoice: <span className="font-mono font-semibold text-slate-700">{activePaymentBill.invoice_number}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivePaymentBill(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                <FiX size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleRecordPayment} className="p-5 space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-center">
                <div>
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">Total Bill</span>
                  <span className="text-xs font-bold text-slate-800">
                    ₹{Number(activePaymentBill.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider block">Already Paid</span>
                  <span className="text-xs font-bold text-emerald-700">
                    ₹{Number(activePaymentBill.paid_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-medium text-rose-600 uppercase tracking-wider block">Current Due</span>
                  <span className="text-xs font-bold text-rose-700">
                    ₹{Number(activePaymentBill.pending_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              {/* Amount Input */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700">
                    Payment Amount to Receive (₹) <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Max: ₹{Number(activePaymentBill.pending_amount || 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-semibold text-sm">₹</span>
                  <input
                    type="number"
                    min="1"
                    max={Number(activePaymentBill.pending_amount || 0)}
                    step="0.01"
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="Enter amount being paid"
                    className="w-full pl-8 pr-3 py-2 text-sm font-bold bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none text-slate-900"
                  />
                </div>

                {/* Quick Fill Chips */}
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-medium">Quick:</span>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(activePaymentBill.pending_amount.toString())}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
                  >
                    Pay Full Due (₹{Number(activePaymentBill.pending_amount || 0).toLocaleString('en-IN')})
                  </button>
                  {Number(activePaymentBill.pending_amount || 0) > 100 && (
                    <button
                      type="button"
                      onClick={() => setPaymentAmount(Math.round(Number(activePaymentBill.pending_amount || 0) / 2).toString())}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition"
                    >
                      50% (₹{Math.round(Number(activePaymentBill.pending_amount || 0) / 2).toLocaleString('en-IN')})
                    </button>
                  )}
                </div>
              </div>

              {/* Payment Method */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Payment Mode</label>
                <div className="grid grid-cols-4 gap-1.5 text-xs">
                  {['cash', 'upi', 'card', 'bank_transfer'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`py-1.5 px-2 rounded-xl font-semibold capitalize border text-center transition ${
                        paymentMethod === m
                          ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {m.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Notes / Reference (Optional)</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="e.g. 2nd installment, UPI Ref #, Cheque #..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActivePaymentBill(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recordingPayment || !paymentAmount || parseFloat(paymentAmount) <= 0}
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5"
                >
                  <FiCheck size={14} />
                  <span>{recordingPayment ? 'Recording...' : `Record ₹${parseFloat(paymentAmount || 0).toLocaleString('en-IN')} Payment`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: View Payment Receipts History */}
      {viewHistoryBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-50 to-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                  <FiList size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Payment Receipts History</h3>
                  <p className="text-[11px] text-slate-500">
                    Invoice: <span className="font-mono font-semibold text-slate-700">{viewHistoryBill.invoice_number}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewHistoryBill(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                <FiX size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Financial Snapshot */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div>
                  <span className="text-[10px] text-slate-400 font-medium uppercase block">Total Bill</span>
                  <span className="text-xs font-bold text-slate-800">
                    ₹{Number(viewHistoryBill.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-600 font-medium uppercase block">Total Paid</span>
                  <span className="text-xs font-bold text-emerald-700">
                    ₹{Number(viewHistoryBill.paid_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-rose-600 font-medium uppercase block">Remaining Due</span>
                  <span className="text-xs font-bold text-rose-700">
                    ₹{Number(viewHistoryBill.pending_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              {/* Installments Timeline */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-700">Installments Recorded ({viewHistoryBill.payments?.length || 0})</h4>
                
                {(!viewHistoryBill.payments || viewHistoryBill.payments.length === 0) ? (
                  <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500">
                    No installment receipts logged for this bill.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {viewHistoryBill.payments.map((pmt, idx) => (
                      <div
                        key={pmt.id || idx}
                        className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between shadow-2xs hover:border-amber-300 transition"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">
                            #{idx + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900">
                                ₹{Number(pmt.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] font-semibold uppercase bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                                {pmt.payment_method?.replace('_', ' ') || 'cash'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {pmt.payment_date ? new Date(pmt.payment_date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                              {pmt.notes && <span className="ml-2 text-slate-600 font-medium italic">• "{pmt.notes}"</span>}
                            </p>
                          </div>
                        </div>

                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          Received
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              {Number(viewHistoryBill.pending_amount || 0) > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const b = viewHistoryBill;
                    setViewHistoryBill(null);
                    openPaymentModal(b);
                  }}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition flex items-center gap-1"
                >
                  <FiPlusCircle size={13} /> Pay Remaining Due (₹{Number(viewHistoryBill.pending_amount || 0).toLocaleString('en-IN')})
                </button>
              ) : (
                <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  <FiCheckCircle /> Fully Paid & Settled
                </span>
              )}
              <button
                type="button"
                onClick={() => setViewHistoryBill(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerHistory;