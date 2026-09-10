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
  FiTrendingUp,
  FiPercent,
  FiEdit3,
  FiTag,
  FiCheckCircle,
  FiClock
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

  // Billing Enhancements State
  const [applyGst, setApplyGst] = useState(true); // GST (3%) ON/OFF toggle, ON by default
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [paymentStatusType, setPaymentStatusType] = useState('paid'); // 'paid', 'partial', 'unpaid'
  const [paidAmountInput, setPaidAmountInput] = useState('');

  // Manual non-inventory items modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    name: '',
    metal_type: 'Gold',
    purity: 22,
    weight: '',
    quantity: 1,
    making_charge_mode: 'rupees_per_gram', // 'rupees_per_gram', 'flat_rupees', 'percentage'
    making_charges: '',
    wastage_percentage: 0,
    description: ''
  });

  // Cached Live Gold Rate for accurate on-the-fly valuation
  const { data: goldRate } = useCachedApi('/gold-rate/', { ttl: 60000 });
  const rate24k = goldRate?.gold_rate_24k || 7250;
  const silverRate = goldRate?.silver_rate || 89;

  // Cached inventory & customers for instant search
  const debouncedCustomerSearch = useDebounce(customerSearch, 200);
  const debouncedItemSearch = useDebounce(itemSearch, 200);

  const { data: rawCustResults } = useCachedApi(
    debouncedCustomerSearch ? `/customers/?search=${encodeURIComponent(debouncedCustomerSearch)}` : '/customers/',
    { ttl: 60000, initialData: [] }
  );
  const customerResults = Array.isArray(rawCustResults) ? rawCustResults : [];

  const { data: rawInvResults } = useCachedApi(
    debouncedItemSearch ? `/inventory/?search=${encodeURIComponent(debouncedItemSearch)}` : '/inventory/',
    { ttl: 60000, initialData: [] }
  );
  const inventoryResults = Array.isArray(rawInvResults) ? rawInvResults : [];

  const addItem = (item) => {
    const existingIndex = selectedItems.findIndex(i => !i.is_manual && i.jewellery_id === item.id);
    if (existingIndex > -1) {
      toast.error('Item is already in this bill. Adjust quantity below.');
      return;
    }
    
    if (item.stock_quantity < 1) {
      toast.error('This item is currently out of stock');
      return;
    }

    const isGold = item.metal_type?.toLowerCase() === 'gold';
    const baseRate = isGold ? rate24k : silverRate;
    const purityFactor = isGold ? ((Number(item.purity) || 22) / 24) : 1.0;
    const singleProductValue = (Number(item.weight) || 0) * baseRate * purityFactor;
    const defaultMakingPerPiece = (Number(item.weight) || 0) * (Number(item.making_charges) || 0);

    setSelectedItems(prev => [
      ...prev,
      {
        unique_id: `inv_${item.id}_${Date.now()}`,
        is_manual: false,
        jewellery_id: item.id,
        quantity: 1,
        item_details: item,
        // Making charges support: 'fixed' (₹) or 'percentage' (%)
        making_type: 'fixed',
        making_value: defaultMakingPerPiece, // in ₹ if 'fixed', in % if 'percentage'
        base_product_value: singleProductValue
      }
    ]);
    setShowItemSearch(false);
    setItemSearch('');
  };

  const getManualFormPricing = () => {
    const isGold = (manualForm.metal_type || 'Gold').toLowerCase() === 'gold';
    const baseRate = isGold ? rate24k : silverRate;
    const weight = parseFloat(manualForm.weight) || 0;
    const purity = isGold ? (Number(manualForm.purity) || 22) : 0;
    const purityFactor = isGold ? (purity / 24) : 1.0;
    const qty = parseInt(manualForm.quantity, 10) || 1;
    const wastagePct = parseFloat(manualForm.wastage_percentage) || 0;

    const singleMetalValue = weight * baseRate * purityFactor;

    let singleMaking = 0;
    const makingInput = parseFloat(manualForm.making_charges) || 0;
    if (manualForm.making_charge_mode === 'rupees_per_gram') {
      singleMaking = weight * makingInput;
    } else if (manualForm.making_charge_mode === 'flat_rupees') {
      singleMaking = makingInput;
    } else if (manualForm.making_charge_mode === 'percentage') {
      singleMaking = (singleMetalValue * makingInput) / 100;
    }

    const singleWastage = singleMetalValue * (wastagePct / 100);
    const singleSubtotal = singleMetalValue + singleMaking + singleWastage;
    const singleGst = singleSubtotal * 0.03;
    const singleTotal = singleSubtotal + singleGst;

    return {
      baseRate,
      singleMetalValue,
      singleMaking,
      singleWastage,
      singleSubtotal,
      singleGst,
      singleTotal,
      totalMetalValue: singleMetalValue * qty,
      totalMaking: singleMaking * qty,
      totalWastage: singleWastage * qty,
      subtotal: singleSubtotal * qty,
      gst: singleGst * qty,
      total: singleTotal * qty,
    };
  };

  const addManualItem = () => {
    const name = manualForm.name.trim();
    if (!name) {
      toast.error('Please enter an item name');
      return;
    }
    const weight = parseFloat(manualForm.weight);
    if (isNaN(weight) || weight <= 0) {
      toast.error('Please enter a valid gross weight (greater than 0)');
      return;
    }
    const qty = parseInt(manualForm.quantity, 10) || 1;
    if (qty < 1) {
      toast.error('Please enter a valid quantity');
      return;
    }

    const pricing = getManualFormPricing();
    const isGold = (manualForm.metal_type || 'Gold').toLowerCase() === 'gold';
    const purity = isGold ? (Number(manualForm.purity) || 22) : 0;
    const makingInput = parseFloat(manualForm.making_charges) || 0;

    const manualItemDetails = {
      id: null,
      name: name,
      product_code: 'CUSTOM',
      metal_type: manualForm.metal_type,
      purity: purity,
      weight: weight,
      making_charges: manualForm.making_charge_mode === 'rupees_per_gram' ? makingInput : (weight > 0 ? pricing.singleMaking / weight : 0),
      wastage_percentage: parseFloat(manualForm.wastage_percentage) || 0,
      description: manualForm.description?.trim() || '',
      image_url: ''
    };

    setSelectedItems(prev => [
      ...prev,
      {
        unique_id: `manual_${Date.now()}_${Math.random()}`,
        is_manual: true,
        jewellery_id: null,
        name: name,
        quantity: qty,
        item_details: manualItemDetails,
        making_type: manualForm.making_charge_mode === 'percentage' ? 'percentage' : 'fixed',
        making_value: manualForm.making_charge_mode === 'percentage' ? makingInput : pricing.singleMaking,
        base_product_value: pricing.singleMetalValue,
        rate: weight > 0 ? (pricing.singleMetalValue / weight) : pricing.singleMetalValue,
        total: pricing.subtotal
      }
    ]);

    setManualForm({
      name: '',
      metal_type: 'Gold',
      purity: 22,
      weight: '',
      quantity: 1,
      making_charge_mode: 'rupees_per_gram',
      making_charges: '',
      wastage_percentage: 0,
      description: ''
    });
    setShowManualModal(false);
    toast.success('Custom jewellery item added to invoice');
  };

  const updateQuantity = (index, delta) => {
    setSelectedItems(prev => {
      const updated = [...prev];
      const item = updated[index];
      const newQty = item.quantity + delta;
      if (newQty < 1) return prev;
      
      if (!item.is_manual && newQty > item.item_details.stock_quantity) {
        toast.error(`Only ${item.item_details.stock_quantity} available in stock`);
        return prev;
      }
      
      if (item.is_manual) {
        updated[index] = { 
          ...item, 
          quantity: newQty,
          total: newQty * item.rate
        };
      } else {
        updated[index] = { ...item, quantity: newQty };
      }
      return updated;
    });
  };

  const updateMakingChargeType = (index, newType) => {
    setSelectedItems(prev => {
      const updated = [...prev];
      const item = updated[index];
      if (item.is_manual && !item.item_details) return prev;

      const singleProdVal = item.base_product_value || 1;
      let newValue = item.making_value;

      if (newType === 'percentage' && item.making_type === 'fixed') {
        // Converting fixed ₹ to percentage of product value
        newValue = singleProdVal > 0 ? Number(((item.making_value / singleProdVal) * 100).toFixed(2)) : 0;
      } else if (newType === 'fixed' && item.making_type === 'percentage') {
        // Converting percentage to fixed ₹
        newValue = Number(((singleProdVal * item.making_value) / 100).toFixed(2));
      }

      updated[index] = {
        ...item,
        making_type: newType,
        making_value: newValue
      };
      return updated;
    });
  };

  const updateMakingChargeValue = (index, val) => {
    setSelectedItems(prev => {
      const updated = [...prev];
      const item = updated[index];
      if (item.is_manual && !item.item_details) return prev;

      const num = parseFloat(val) || 0;
      updated[index] = {
        ...item,
        making_value: num
      };
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
    let manualItemsTotal = 0;

    selectedItems.forEach(cartItem => {
      if (cartItem.is_manual && !cartItem.item_details) {
        manualItemsTotal += Number(cartItem.total) || (Number(cartItem.quantity) * Number(cartItem.rate)) || 0;
        return;
      }

      const item = cartItem.item_details;
      const qty = cartItem.quantity;
      const weight = Number(item.weight) || 0;
      const purity = Number(item.purity) || 22;
      const wastagePct = Number(item.wastage_percentage) || 0;

      const isGold = item.metal_type?.toLowerCase() === 'gold';
      const baseRate = isGold ? rate24k : silverRate;
      const purityFactor = isGold ? (purity / 24) : 1.0;
      const singleGoldVal = weight * baseRate * purityFactor;
      const itemGoldValue = singleGoldVal * qty;

      // Making charges calculation
      let singleMakingVal = 0;
      if (cartItem.making_type === 'percentage') {
        singleMakingVal = (singleGoldVal * (Number(cartItem.making_value) || 0)) / 100;
      } else {
        singleMakingVal = Number(cartItem.making_value) || 0;
      }
      const itemMaking = singleMakingVal * qty;

      const itemWastage = itemGoldValue * (wastagePct / 100);

      grossGoldValue += itemGoldValue;
      grossMakingCharges += itemMaking;
      grossWastage += itemWastage;
    });

    const grossSubtotal = grossGoldValue + grossMakingCharges + grossWastage + manualItemsTotal;

    // Smart Discount deduction
    const discAmt = parseFloat(discountAmount) || 0;
    const taxableAmount = Math.max(0, grossSubtotal - discAmt);

    // GST (3%) ON/OFF toggle calculation
    const gst = applyGst ? taxableAmount * 0.03 : 0;
    const total = taxableAmount + gst;

    return { 
      grossGoldValue, 
      grossMakingCharges, 
      grossWastage, 
      manualItemsTotal, 
      grossSubtotal, 
      discountAmount: discAmt,
      taxableAmount, 
      gst, 
      total 
    };
  };

  const totals = calculateBillTotals();
  const grandTotal = Math.round(totals.total);

  // Compute live paid and pending amount
  let computedPaidAmount = grandTotal;
  let computedPendingAmount = 0;

  if (paymentStatusType === 'partial') {
    const customPaid = parseFloat(paidAmountInput);
    computedPaidAmount = !isNaN(customPaid) ? Math.min(grandTotal, Math.max(0, customPaid)) : 0;
    computedPendingAmount = Math.max(0, grandTotal - computedPaidAmount);
  } else if (paymentStatusType === 'unpaid') {
    computedPaidAmount = 0;
    computedPendingAmount = grandTotal;
  }

  // Smart Discount Handlers (Sync ₹ and %)
  const handleDiscountAmountChange = (val) => {
    setDiscountAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && totals.grossSubtotal > 0) {
      const pct = (num / totals.grossSubtotal) * 100;
      setDiscountPercent(pct % 1 === 0 ? pct.toString() : pct.toFixed(2));
    } else {
      setDiscountPercent('');
    }
  };

  const handleDiscountPercentChange = (val) => {
    setDiscountPercent(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && totals.grossSubtotal > 0) {
      const amt = (totals.grossSubtotal * num) / 100;
      setDiscountAmount(amt % 1 === 0 ? amt.toString() : amt.toFixed(2));
    } else {
      setDiscountAmount('');
    }
  };

  const handleCreateBill = async () => {
    if (!selectedCustomer) {
      toast.error('Please select a customer profile first');
      return;
    }
    
    if (selectedItems.length === 0) {
      toast.error('Please add at least one item to bill');
      return;
    }
    
    setCreatingBill(true);
    
    try {
      const billPayload = {
        customer_id: selectedCustomer.id,
        items: selectedItems.map(i => {
          if (i.is_manual) {
            const details = i.item_details || {};
            return {
              is_manual: true,
              name: i.name || details.name,
              quantity: i.quantity,
              metal_type: details.metal_type || 'Gold',
              purity: details.purity || 0,
              weight: details.weight || 0,
              wastage_percentage: details.wastage_percentage || 0,
              making_charges_type: i.making_type || 'fixed',
              making_charges_value: Number(i.making_value || 0),
              rate: Number(i.rate || 0),
              total: Number(i.total || 0)
            };
          }
          return {
            jewellery_id: i.jewellery_id,
            quantity: i.quantity,
            making_charges_type: i.making_type,
            making_charges_value: Number(i.making_value)
          };
        }),
        apply_gst: applyGst,
        discount_amount: parseFloat(discountAmount) || 0,
        discount_percentage: parseFloat(discountPercent) || 0,
        paid_amount: computedPaidAmount,
        payment_status: paymentStatusType === 'paid' ? 'paid' : paymentStatusType === 'unpaid' ? 'unpaid' : 'partial',
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
      setDiscountAmount('');
      setDiscountPercent('');
      setPaymentStatusType('paid');
      setPaidAmountInput('');
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
          <p className="text-xs text-slate-500 mt-0.5">Create tax invoices, configure flexible making charges, smart discounts, GST toggle, and manual line items</p>
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

          {/* Jewellery & Manual Items Cart Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FiBox className="text-amber-600" />
                Invoice Items ({selectedItems.length})
              </h2>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl border border-slate-200 transition"
                  title="Add non-inventory product directly to invoice"
                >
                  <FiEdit3 size={13} className="text-amber-600" />
                  <span>+ Manual Item</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowItemSearch(!showItemSearch)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold rounded-xl border border-amber-200/80 transition"
                >
                  <FiPlus size={14} />
                  <span>Add from Stock</span>
                </button>
              </div>
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
                              {inv.product_code} • {inv.metal_type?.toLowerCase() === 'gold' ? `${inv.metal_type} ${inv.purity}K` : 'Silver'} • {inv.weight}g
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

            {/* Manual Custom Jewellery Item Modal */}
            {showManualModal && (() => {
              const pricing = getManualFormPricing();
              const isGold = (manualForm.metal_type || 'Gold').toLowerCase() === 'gold';

              return (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
                  <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto">
                    <div className="flex justify-between items-center pb-3 sm:pb-4 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                          <FiTag size={16} />
                        </div>
                        <div>
                          <h2 className="text-sm sm:text-base font-bold text-slate-900">
                            Add Custom / Manual Jewellery Item
                          </h2>
                          <p className="text-[10px] sm:text-xs text-slate-500">
                            Directly bills custom or bespoke ornaments without altering inventory
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowManualModal(false)}
                        className="p-1 sm:p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                      >
                        <FiX size={18} />
                      </button>
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); addManualItem(); }} className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
                      {/* Item Title */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Item Title / Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={manualForm.name}
                          onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                          placeholder="e.g. Traditional 22K Gold Bridal Necklace"
                        />
                      </div>

                      {/* Metal Type & Purity */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Metal Type</label>
                          <select
                            value={manualForm.metal_type}
                            onChange={(e) => {
                              const selected = e.target.value;
                              setManualForm(prev => ({
                                ...prev,
                                metal_type: selected,
                                purity: selected === 'Silver' ? 0 : (prev.purity || 22)
                              }));
                            }}
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                          >
                            <option value="Gold">Gold</option>
                            <option value="Silver">Silver</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            {manualForm.metal_type === 'Silver' ? 'Purity' : 'Purity (Karat / %)'}
                          </label>
                          {manualForm.metal_type === 'Silver' ? (
                            <div className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-medium flex items-center justify-between">
                              <span>Standard Silver</span>
                              <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">Pure</span>
                            </div>
                          ) : (
                            <select
                              value={manualForm.purity}
                              onChange={(e) => setManualForm({ ...manualForm, purity: Number(e.target.value) })}
                              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                            >
                              <option value={24}>24 Karat (99.9% Pure)</option>
                              <option value={22}>22 Karat (91.6% Hallmark)</option>
                              <option value={18}>18 Karat (75.0% Jewellery)</option>
                              <option value={14}>14 Karat (58.5%)</option>
                            </select>
                          )}
                        </div>
                      </div>

                      {/* Gross Weight & Quantity */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Gross Weight (grams) *</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            value={manualForm.weight}
                            onChange={(e) => setManualForm({ ...manualForm, weight: e.target.value })}
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                            placeholder="12.50"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity *</label>
                          <input
                            type="number"
                            min="1"
                            required
                            value={manualForm.quantity}
                            onChange={(e) => setManualForm({ ...manualForm, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                            placeholder="1"
                          />
                        </div>
                      </div>

                      {/* Making Charges (Rupees / g, Total Flat Rupees, or %) */}
                      <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/80 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold text-amber-950">
                            Making Charges (Rupees Options)
                          </label>
                          {/* Mode Selector Buttons */}
                          <div className="inline-flex rounded-lg border border-amber-300/80 bg-white p-0.5 shadow-2xs text-[10px]">
                            <button
                              type="button"
                              onClick={() => setManualForm({ ...manualForm, making_charge_mode: 'rupees_per_gram' })}
                              className={`px-2 py-0.5 rounded-md font-semibold transition ${
                                manualForm.making_charge_mode === 'rupees_per_gram'
                                  ? 'bg-amber-500 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              ₹ / gram
                            </button>
                            <button
                              type="button"
                              onClick={() => setManualForm({ ...manualForm, making_charge_mode: 'flat_rupees' })}
                              className={`px-2 py-0.5 rounded-md font-semibold transition ${
                                manualForm.making_charge_mode === 'flat_rupees'
                                  ? 'bg-amber-500 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Flat ₹ (Total)
                            </button>
                            <button
                              type="button"
                              onClick={() => setManualForm({ ...manualForm, making_charge_mode: 'percentage' })}
                              className={`px-2 py-0.5 rounded-md font-semibold transition ${
                                manualForm.making_charge_mode === 'percentage'
                                  ? 'bg-amber-500 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              % Percent
                            </button>
                          </div>
                        </div>

                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold text-xs">
                            {manualForm.making_charge_mode === 'percentage' ? '%' : '₹'}
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={manualForm.making_charges}
                            onChange={(e) => setManualForm({ ...manualForm, making_charges: e.target.value })}
                            className="w-full pl-8 pr-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none font-semibold"
                            placeholder={
                              manualForm.making_charge_mode === 'rupees_per_gram'
                                ? 'e.g. 450 (rupees per gram)'
                                : manualForm.making_charge_mode === 'flat_rupees'
                                  ? 'e.g. 1500 (total rupees)'
                                  : 'e.g. 8 (% of metal value)'
                            }
                          />
                        </div>

                        <div className="text-[11px] text-amber-900 flex items-center justify-between pt-0.5">
                          <span>
                            {manualForm.making_charge_mode === 'rupees_per_gram' && (
                              <>Rate: <strong>₹{parseFloat(manualForm.making_charges) || 0}/g</strong> × {parseFloat(manualForm.weight) || 0}g</>
                            )}
                            {manualForm.making_charge_mode === 'flat_rupees' && (
                              <>Flat making in rupees: <strong>₹{parseFloat(manualForm.making_charges) || 0}</strong></>
                            )}
                            {manualForm.making_charge_mode === 'percentage' && (
                              <>{parseFloat(manualForm.making_charges) || 0}% of ₹{pricing.singleMetalValue.toFixed(0)}</>
                            )}
                          </span>
                          <span className="font-bold text-amber-950">
                            = ₹{pricing.singleMaking.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      </div>

                      {/* Wastage % */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Wastage %</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={manualForm.wastage_percentage}
                          onChange={(e) => setManualForm({ ...manualForm, wastage_percentage: e.target.value })}
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                          placeholder="0"
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Hallmark Details</label>
                        <textarea
                          rows="2"
                          value={manualForm.description}
                          onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                          className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                          placeholder="e.g. BIS Hallmarked, Antique bridal finish..."
                        />
                      </div>

                      {/* Real-time Calculation Summary Box */}
                      <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 space-y-1.5 text-xs">
                        <div className="flex justify-between items-center text-slate-500 text-[11px] pb-1 border-b border-slate-200/60">
                          <span>Live Metal Rate:</span>
                          <span className="font-semibold text-slate-700">
                            {isGold ? `24K Gold: ₹${rate24k}/g` : `Silver: ₹${silverRate}/g`}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Net Metal Value ({isGold ? `${manualForm.purity}K` : 'Silver'}):</span>
                          <span className="font-semibold text-slate-800">₹{pricing.totalMetalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Total Making Charges:</span>
                          <span className="font-semibold text-slate-800">₹{pricing.totalMaking.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                        </div>
                        {pricing.totalWastage > 0 && (
                          <div className="flex justify-between text-slate-600">
                            <span>Wastage Allowance ({manualForm.wastage_percentage}%):</span>
                            <span className="font-semibold text-slate-800">₹{pricing.totalWastage.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                          </div>
                        )}
                        <div className="flex justify-between pt-1.5 border-t border-slate-200 font-bold text-slate-900 text-sm">
                          <span>Subtotal:</span>
                          <span className="text-amber-700">₹{pricing.subtotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 text-right">
                          +3% GST (₹{pricing.gst.toFixed(0)}) = ₹{pricing.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })} estimated total
                        </div>
                      </div>

                      {/* Modal Footer */}
                      <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setShowManualModal(false)}
                          className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 text-xs font-semibold bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl shadow-sm hover:from-amber-600 hover:to-amber-700 transition"
                        >
                          + Add to Invoice
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              );
            })()}

            {/* Items Table */}
            {selectedItems.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <IoDiamondOutline className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-500">Cart is empty</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Click "Add from Stock" or "+ Manual Item" to begin billing</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-3">Item Description</th>
                      <th className="py-2.5 px-3">Specs / Making Charges</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Line Total</th>
                      <th className="py-2.5 px-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedItems.map((cartItem, idx) => {
                      if (cartItem.is_manual && !cartItem.item_details) {
                        return (
                          <tr key={cartItem.unique_id} className="hover:bg-slate-50/50 bg-amber-50/20">
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-amber-100/80 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                                  <FiTag size={15} />
                                </div>
                                <div>
                                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                    {cartItem.name}
                                    <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                                      Manual Item
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400">Non-inventory line item</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-xs text-slate-700 font-medium">
                                Rate: ₹{Number(cartItem.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(idx, -1)}
                                  className="px-2 py-0.5 text-slate-600 hover:bg-slate-100 font-bold"
                                >
                                  -
                                </button>
                                <span className="px-2 font-semibold text-slate-900 text-xs">{cartItem.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(idx, 1)}
                                  className="px-2 py-0.5 text-slate-600 hover:bg-slate-100 font-bold"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-slate-900">
                              ₹{(Number(cartItem.total) || (cartItem.quantity * cartItem.rate)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                className="text-slate-400 hover:text-rose-600 p-1 transition"
                                title="Remove item"
                              >
                                <FiTrash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      const item = cartItem.item_details;
                      const isGold = item.metal_type?.toLowerCase() === 'gold';
                      const baseRate = isGold ? rate24k : silverRate;
                      const singleGold = (Number(item.weight) || 0) * baseRate * (isGold ? ((Number(item.purity) || 22) / 24) : 1.0);
                      
                      let singleMaking = 0;
                      if (cartItem.making_type === 'percentage') {
                        singleMaking = (singleGold * (Number(cartItem.making_value) || 0)) / 100;
                      } else {
                        singleMaking = Number(cartItem.making_value) || 0;
                      }

                      const itemSubtotal = (singleGold + singleMaking + (singleGold * ((Number(item.wastage_percentage) || 0) / 100))) * cartItem.quantity;

                      return (
                        <tr key={cartItem.unique_id} className={`hover:bg-slate-50/50 ${cartItem.is_manual ? 'bg-amber-50/15' : ''}`}>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              {item.image_url ? (
                                <img src={getImageUrl(item.image_url)} alt={item.name} className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0" />
                              ) : (
                                <div className={`w-10 h-10 rounded-lg ${cartItem.is_manual ? 'bg-amber-100 text-amber-700 border border-amber-300' : 'bg-amber-50 text-amber-600 border border-amber-200/80'} flex items-center justify-center shrink-0`}>
                                  {cartItem.is_manual ? <FiTag size={16} /> : <IoDiamondOutline size={16} />}
                                </div>
                              )}
                              <div>
                                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                  {item.name}
                                  {cartItem.is_manual && (
                                    <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                                      Custom
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">{item.product_code}</div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-3 space-y-1.5">
                            <div className="text-xs text-slate-700 font-medium">
                              {item.metal_type?.toLowerCase() === 'gold' ? `${item.metal_type} ${item.purity}K` : 'Silver'} • {item.weight}g
                            </div>

                            {/* Making Charges Interactive Toggle: Fixed ₹ or % */}
                            <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-200 max-w-[210px]">
                              <span className="text-[10px] text-slate-500 font-semibold">Making:</span>
                              
                              {/* Toggle switch between ₹ and % */}
                              <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 shadow-sm text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => updateMakingChargeType(idx, 'fixed')}
                                  className={`px-1.5 py-0.5 rounded font-bold transition ${cartItem.making_type === 'fixed' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                                >
                                  ₹
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateMakingChargeType(idx, 'percentage')}
                                  className={`px-1.5 py-0.5 rounded font-bold transition ${cartItem.making_type === 'percentage' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                                >
                                  %
                                </button>
                              </div>

                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={cartItem.making_value}
                                onChange={(e) => updateMakingChargeValue(idx, e.target.value)}
                                className="w-16 px-1.5 py-0.5 text-xs font-semibold bg-white border border-slate-200 rounded text-right focus:ring-1 focus:ring-amber-500 outline-none"
                              />

                              <span className="text-[10px] text-slate-400 font-medium">
                                {cartItem.making_type === 'percentage' ? '%' : '₹'}
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                              <button
                                type="button"
                                onClick={() => updateQuantity(idx, -1)}
                                className="px-2 py-0.5 text-slate-600 hover:bg-slate-100 font-bold"
                              >
                                -
                              </button>
                              <span className="px-2 font-semibold text-slate-900 text-xs">{cartItem.quantity}</span>
                              <button
                                type="button"
                                onClick={() => updateQuantity(idx, 1)}
                                className="px-2 py-0.5 text-slate-600 hover:bg-slate-100 font-bold"
                              >
                                +
                              </button>
                            </div>
                          </td>

                          <td className="py-3 px-3 text-right font-bold text-slate-900">
                            ₹{itemSubtotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>

                          <td className="py-3 px-2 text-right">
                            <button
                              type="button"
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

              {totals.manualItemsTotal > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Manual Items Total:</span>
                  <span className="font-semibold text-slate-800">
                    ₹{totals.manualItemsTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-slate-700 font-semibold pt-1 border-t border-slate-100">
                <span>Gross Subtotal:</span>
                <span className="font-bold text-slate-900">
                  ₹{totals.grossSubtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>

              {/* Smart Discount (Dual-linked ₹ and %) */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <FiPercent className="text-amber-600" />
                    Smart Discount
                  </span>
                  {totals.discountAmount > 0 && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                      -₹{totals.discountAmount.toFixed(2)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-medium mb-0.5">Amount (₹)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-400 text-xs">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={discountAmount}
                        onChange={(e) => handleDiscountAmountChange(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-6 pr-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 font-medium mb-0.5">Percent (%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={discountPercent}
                        onChange={(e) => handleDiscountPercentChange(e.target.value)}
                        placeholder="0.0%"
                        className="w-full pl-2 pr-6 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none font-semibold"
                      />
                      <span className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 text-xs">%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* GST (3%) ON/OFF Toggle Switch */}
              <div className="flex items-center justify-between p-2.5 bg-amber-500/5 rounded-xl border border-amber-200/70">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900">GST (3%)</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${applyGst ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'}`}>
                      {applyGst ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {applyGst ? 'Tax added to final invoice' : 'Zero tax / Tax-free invoice'}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {applyGst && (
                    <span className="text-xs font-bold text-amber-800">
                      ₹{totals.gst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setApplyGst(!applyGst)}
                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      applyGst ? 'bg-amber-600' : 'bg-slate-300'
                    }`}
                    role="switch"
                    aria-checked={applyGst}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        applyGst ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Grand Total */}
              <div className="flex justify-between items-baseline text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Final Total:</span>
                <span className="text-xl text-amber-700 font-extrabold tracking-tight">
                  ₹{totals.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            {/* Payment Settlement / Advance & Due */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <FiDollarSign className="text-amber-600" />
                  Payment Settlement
                </label>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                  paymentStatusType === 'paid' 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : paymentStatusType === 'partial' 
                      ? 'bg-amber-100 text-amber-800' 
                      : 'bg-rose-100 text-rose-800'
                }`}>
                  {paymentStatusType === 'paid' ? 'Full Paid' : paymentStatusType === 'partial' ? 'Advance / Partial' : 'Credit / Pending'}
                </span>
              </div>

              {/* 3 Settlement Mode Segmented Buttons */}
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-white rounded-lg border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentStatusType('paid');
                    setPaidAmountInput('');
                  }}
                  className={`py-1.5 px-2 rounded-md font-semibold text-center transition ${
                    paymentStatusType === 'paid'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Full Paid
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentStatusType('partial');
                    if (!paidAmountInput) {
                      setPaidAmountInput(Math.round(grandTotal / 2).toString());
                    }
                  }}
                  className={`py-1.5 px-2 rounded-md font-semibold text-center transition ${
                    paymentStatusType === 'partial'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Partial
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentStatusType('unpaid');
                    setPaidAmountInput('0');
                  }}
                  className={`py-1.5 px-2 rounded-md font-semibold text-center transition ${
                    paymentStatusType === 'unpaid'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Full Due
                </button>
              </div>

              {/* Partial Advance Input */}
              {paymentStatusType === 'partial' && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Advance Paid Now (₹)
                    </label>
                    <span className="text-[10px] text-slate-400">Min: ₹0 • Max: ₹{grandTotal.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 text-xs font-semibold">₹</span>
                    <input
                      type="number"
                      min="0"
                      max={grandTotal}
                      step="1"
                      value={paidAmountInput}
                      onChange={(e) => setPaidAmountInput(e.target.value)}
                      placeholder="Enter advance amount"
                      className="w-full pl-7 pr-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none text-slate-900"
                    />
                  </div>

                  {/* Quick percentage chips */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400 font-medium">Quick:</span>
                    {[25, 50, 75].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setPaidAmountInput(Math.round((grandTotal * pct) / 100).toString())}
                        className="text-[10px] px-2 py-0.5 font-semibold bg-white border border-slate-200 rounded text-slate-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 transition"
                      >
                        {pct}% (₹{Math.round((grandTotal * pct) / 100).toLocaleString('en-IN')})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Real-time Paid vs Due Breakdown Box */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 space-y-1.5 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span className="flex items-center gap-1 text-[11px]">
                    <FiCheckCircle className="text-emerald-600" size={12} />
                    Amount Paid Now:
                  </span>
                  <span className="font-bold text-emerald-600">
                    ₹{computedPaidAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-100">
                  <span className="flex items-center gap-1 text-[11px]">
                    <FiClock className={computedPendingAmount > 0 ? "text-rose-500" : "text-slate-400"} size={12} />
                    Pending / Due Balance:
                  </span>
                  <span className={`font-bold ${computedPendingAmount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                    ₹{computedPendingAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
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
                placeholder="Hallmark ID, remarks, custom warranty..."
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