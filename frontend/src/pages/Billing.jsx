import React, { useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useCachedApi, invalidateCache } from '../utils/cache';
import { useDebounce } from '../utils/useDebounce';
import { 
  FiSearch, 
  FiPlus, 
  FiTrash2, 
  FiPrinter, 
  FiUser, 
  FiBox, 
  FiCheck, 
  FiCreditCard, 
  FiDollarSign, 
  FiFileText,
  FiX,
  FiTrendingUp
} from 'react-icons/fi';
import { IoDiamondOutline } from 'react-icons/io5';

const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const rawBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const apiBase = rawBase.replace(/\/+$/, '');
  return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
};

const Billing = () => {
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showItemSearch, setShowItemSearch] = useState(false);
  const [creatingBill, setCreatingBill] = useState(false);

  // Cached Live Gold Rate for accurate on-the-fly valuation
  const { data: goldRate } = useCachedApi('/gold-rate/', { ttl: 60000 });
  const rate24k = goldRate?.gold_rate_24k || 7250;
  const silverRate = goldRate?.silver_rate || 89;

  // Cached inventory & customers for instant search
  const debouncedCustomerSearch = useDebounce(customerSearch, 200);
  const debouncedItemSearch = useDebounce(itemSearch, 200);

  const { data: rawCustResults } = useCachedApi(
    debouncedCustomerSearch ? `/customers/?search=${encodeURIComponent(debouncedCustomerSearch)}` : '/customers/',
    { ttl: 30000, initialData: [] }
  );
  const customerResults = Array.isArray(rawCustResults) ? rawCustResults : [];

  const { data: rawInvResults } = useCachedApi(
    debouncedItemSearch ? `/inventory/?search=${encodeURIComponent(debouncedItemSearch)}` : '/inventory/',
    { ttl: 30000, initialData: [] }
  );
  const inventoryResults = Array.isArray(rawInvResults) ? rawInvResults : [];

  const addItem = (item) => {
    const existingIndex = selectedItems.findIndex(i => i.jewellery_id === item.id);
    if (existingIndex > -1) {
      toast.error('Item is already in this bill. Adjust quantity below.');
      return;
    }
    
    if (item.stock_quantity < 1) {
      toast.error('This item is currently out of stock');
      return;
    }
    
    setSelectedItems(prev => [
      ...prev,
      {
        jewellery_id: item.id,
        quantity: 1,
        item_details: item
      }
    ]);
    setShowItemSearch(false);
    setItemSearch('');
  };

  const updateQuantity = (index, delta) => {
    setSelectedItems(prev => {
      const updated = [...prev];
      const item = updated[index];
      const newQty = item.quantity + delta;
      if (newQty < 1) return prev;
      if (newQty > item.item_details.stock_quantity) {
        toast.error(`Only ${item.item_details.stock_quantity} available in stock`);
        return prev;
      }
      updated[index] = { ...item, quantity: newQty };
      return updated;
    });
  };

  const removeItem = (index) => {
    setSelectedItems(prev => prev.filter((_, i) => i !== index));
  };

  // Precise calculation according to standard Indian jewellery billing
  const calculateBillTotals = () => {
    let grossGoldValue = 0;
    let grossMakingCharges = 0;
    let grossWastage = 0;

    selectedItems.forEach(cartItem => {
      const item = cartItem.item_details;
      const qty = cartItem.quantity;
      const weight = Number(item.weight) || 0;
      const purity = Number(item.purity) || 22;
      const makingPerGram = Number(item.making_charges) || 0;
      const wastagePct = Number(item.wastage_percentage) || 0;

      const baseRate = item.metal_type?.toLowerCase() === 'gold' ? rate24k : silverRate;
      const purityFactor = purity / 24;
      const itemGoldValue = weight * baseRate * purityFactor * qty;
      const itemMaking = weight * makingPerGram * qty;
      const itemWastage = itemGoldValue * (wastagePct / 100);

      grossGoldValue += itemGoldValue;
      grossMakingCharges += itemMaking;
      grossWastage += itemWastage;
    });

    const subtotal = grossGoldValue + grossMakingCharges + grossWastage;
    const gst = subtotal * 0.03; // 3% GST on jewellery
    const total = subtotal + gst;

    return { grossGoldValue, grossMakingCharges, grossWastage, subtotal, gst, total };
  };

  const totals = calculateBillTotals();

  const handleCreateBill = async () => {
    if (!selectedCustomer) {
      toast.error('Please select a customer profile first');
      return;
    }
    
    if (selectedItems.length === 0) {
      toast.error('Please add at least one jewellery piece to bill');
      return;
    }
    
    setCreatingBill(true);
    
    try {
      const billPayload = {
        customer_id: selectedCustomer.id,
        items: selectedItems.map(i => ({
          jewellery_id: i.jewellery_id,
          quantity: i.quantity
        })),
        payment_method: paymentMethod,
        notes: notes
      };
      
      const response = await api.post('/billing/', billPayload);
      toast.success('Invoice generated successfully!');
      
      // Auto-download PDF Invoice
      try {
        const pdfResponse = await api.get(`/billing/${response.data.id}/pdf`, {
          responseType: 'blob'
        });
        
        const blobUrl = window.URL.createObjectURL(new Blob([pdfResponse.data], { type: 'application/pdf' }));
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.setAttribute('download', `${response.data.invoice_number}.pdf`);
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
      } catch (pdfErr) {
        console.warn('PDF download skipped:', pdfErr);
      }
      
      // Invalidate relevant caches
      invalidateCache('/dashboard');
      invalidateCache('/billing');
      invalidateCache('/inventory');
      invalidateCache('/customers');

      // Reset form
      setSelectedCustomer(null);
      setSelectedItems([]);
      setNotes('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create bill');
    } finally {
      setCreatingBill(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Point of Sale & Billing</h1>
          <p className="text-xs text-slate-500 mt-0.5">Create tax invoices, calculate real-time metal value, making charges, and 3% GST</p>
        </div>

        <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200/80 text-amber-800 px-3.5 py-1.5 rounded-xl font-medium">
          <FiTrendingUp className="text-amber-600" />
          <span>Active Billing Rate: <b>₹{rate24k?.toLocaleString('en-IN')}/g (24K Gold)</b></span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Customer & Items selection */}
        <div className="lg:col-span-2 space-y-5">
          {/* Customer Selection Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FiUser className="text-amber-600" />
                Customer Details
              </h2>
              {selectedCustomer && (
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-xs text-rose-500 hover:text-rose-700 font-medium"
                >
                  Change Customer
                </button>
              )}
            </div>

            {selectedCustomer ? (
              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{selectedCustomer.name}</h3>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3">
                    <span>Phone: <b>{selectedCustomer.phone}</b></span>
                    <span>ID: <b className="font-mono">{selectedCustomer.customer_id}</b></span>
                  </div>
                  {selectedCustomer.address && (
                    <p className="text-xs text-slate-400 mt-1">{selectedCustomer.address}</p>
                  )}
                </div>
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <FiCheck size={16} />
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <FiSearch size={16} />
                  </div>
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setShowCustomerSearch(true);
                    }}
                    onFocus={() => setShowCustomerSearch(true)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
                    placeholder="Search existing customer by name or phone..."
                  />
                </div>

                {/* Dropdown list */}
                {showCustomerSearch && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {customerResults.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No customers found. Add from the Customers tab first.
                      </div>
                    ) : (
                      customerResults.slice(0, 8).map((cust) => (
                        <div
                          key={cust.id}
                          onClick={() => {
                            setSelectedCustomer(cust);
                            setShowCustomerSearch(false);
                            setCustomerSearch('');
                          }}
                          className="p-3 hover:bg-slate-50 cursor-pointer transition flex items-center justify-between"
                        >
                          <div>
                            <p className="text-xs font-semibold text-slate-800">{cust.name}</p>
                            <p className="text-[11px] text-slate-400">{cust.phone} • {cust.customer_id}</p>
                          </div>
                          <span className="text-[11px] font-semibold text-amber-600">Select →</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Jewellery Items Cart Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FiBox className="text-amber-600" />
                Selected Jewellery Items ({selectedItems.length})
              </h2>

              <button
                onClick={() => setShowItemSearch(!showItemSearch)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold rounded-xl border border-amber-200/80 transition"
              >
                <FiPlus size={14} /> Add Items from Stock
              </button>
            </div>

            {/* Item search selector popup / drawer */}
            {showItemSearch && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <FiSearch size={15} />
                  </div>
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    placeholder="Search stock by item name or code..."
                    autoFocus
                  />
                </div>

                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 bg-white rounded-lg border border-slate-200">
                  {inventoryResults.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">No matching jewellery items in stock</div>
                  ) : (
                    inventoryResults.slice(0, 10).map((inv) => (
                      <div
                        key={inv.id}
                        className="p-3 hover:bg-slate-50 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center">
                            {inv.image_url ? (
                              <img src={getImageUrl(inv.image_url)} alt={inv.name} className="w-full h-full object-cover" />
                            ) : (
                              <IoDiamondOutline className="text-slate-400 w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">{inv.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {inv.product_code} • {inv.metal_type} {inv.purity}K • {inv.weight}g
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => addItem(inv)}
                          disabled={inv.stock_quantity < 1}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-semibold rounded-lg transition"
                        >
                          {inv.stock_quantity < 1 ? 'Out of Stock' : '+ Add'}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Items Table */}
            {selectedItems.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <IoDiamondOutline className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-500">Cart is empty</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Click "Add Items from Stock" to select jewellery</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-3">Item</th>
                      <th className="py-2.5 px-3">Purity & Wt</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Estimate</th>
                      <th className="py-2.5 px-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedItems.map((cartItem, idx) => {
                      const item = cartItem.item_details;
                      const baseRate = item.metal_type?.toLowerCase() === 'gold' ? rate24k : silverRate;
                      const itemGold = item.weight * baseRate * (item.purity / 24) * cartItem.quantity;
                      const itemMaking = item.weight * item.making_charges * cartItem.quantity;
                      const itemTotal = (itemGold + itemMaking) * 1.03;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              {item.image_url ? (
                                <img src={getImageUrl(item.image_url)} alt={item.name} className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 shrink-0">
                                  <IoDiamondOutline size={16} />
                                </div>
                              )}
                              <div>
                                <div className="font-semibold text-slate-900">{item.name}</div>
                                <div className="text-[11px] text-slate-400 font-mono">{item.product_code}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-xs text-slate-700 font-medium">
                              {item.metal_type} {item.purity}K
                            </span>
                            <div className="text-[11px] text-slate-400">{item.weight}g each</div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                              <button
                                onClick={() => updateQuantity(idx, -1)}
                                className="px-2 py-0.5 text-slate-600 hover:bg-slate-100 font-bold"
                              >
                                -
                              </button>
                              <span className="px-2 font-semibold text-slate-900 text-xs">{cartItem.quantity}</span>
                              <button
                                onClick={() => updateQuantity(idx, 1)}
                                className="px-2 py-0.5 text-slate-600 hover:bg-slate-100 font-bold"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-slate-900">
                            ₹{itemTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="py-3 px-2 text-right">
                            <button
                              onClick={() => removeItem(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1 transition"
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
        </div>

        {/* Right 1 Col: Billing Summary & Checkout */}
        <div className="space-y-5">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 pb-3 border-b border-slate-100">
              Payment & Tax Summary
            </h2>

            {/* Price breakdown */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Metal Value:</span>
                <span className="font-semibold text-slate-800">
                  ₹{totals.grossGoldValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between text-slate-500">
                <span>Making Charges:</span>
                <span className="font-semibold text-slate-800">
                  ₹{totals.grossMakingCharges.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>

              {totals.grossWastage > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Wastage Charges:</span>
                  <span className="font-semibold text-slate-800">
                    ₹{totals.grossWastage.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-slate-500 pt-1 border-t border-slate-100">
                <span>Subtotal:</span>
                <span className="font-semibold text-slate-800">
                  ₹{totals.subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between text-amber-700 bg-amber-50 p-2 rounded-lg font-medium">
                <span>GST (3%):</span>
                <span className="font-bold">
                  ₹{totals.gst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Grand Total:</span>
                <span className="text-lg text-amber-700">
                  ₹{totals.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            {/* Payment Method */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <label className="block text-xs font-semibold text-slate-700">Payment Mode</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {['cash', 'upi', 'card', 'bank_transfer'].map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`py-2 px-3 rounded-xl font-semibold capitalize border transition text-center ${
                      paymentMethod === method
                        ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {method.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice Notes (Optional)</label>
              <textarea
                rows="2"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 outline-none"
                placeholder="Hallmark ID, payment remarks, or guarantee details..."
              />
            </div>

            {/* Action button */}
            <button
              onClick={handleCreateBill}
              disabled={creatingBill || selectedItems.length === 0 || !selectedCustomer}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
            >
              <FiPrinter size={16} />
              <span>{creatingBill ? 'Generating Invoice...' : 'Generate & Print Tax Bill'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Billing;