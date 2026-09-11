import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useCachedApi, invalidateCache, setCachedData } from '../utils/cache';
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
  FiClock,
  FiPhone,
  FiMapPin,
  FiMail,
  FiRefreshCw
} from 'react-icons/fi';
import { IoDiamondOutline } from 'react-icons/io5';

const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const rawBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const apiBase = rawBase.replace(/\/+$/, '');
  return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
};

/**
 * Purity-aware metal rate resolver:
 * Automatically matches 24K, 22K, 18K and Silver to the exact updated values
 */
const getEffectiveRate = (goldRateObj, metalType, purity) => {
  if (!goldRateObj) {
    return (metalType || '').toLowerCase() === 'silver' ? 89 : 7250;
  }
  const isSilver = (metalType || '').toLowerCase() === 'silver';
  if (isSilver) return Number(goldRateObj.silver_rate) || 89;

  const p = Number(purity) || 22;
  if (Math.abs(p - 24) < 0.2 && goldRateObj.gold_rate_24k) {
    return Number(goldRateObj.gold_rate_24k);
  }
  if (Math.abs(p - 22) < 0.2 && goldRateObj.gold_rate_22k) {
    return Number(goldRateObj.gold_rate_22k);
  }
  if (Math.abs(p - 18) < 0.2 && goldRateObj.gold_rate_18k) {
    return Number(goldRateObj.gold_rate_18k);
  }
  const base24 = Number(goldRateObj.gold_rate_24k) || 7250;
  return (base24 * p) / 24;
};

const Billing = () => {
  // Live Cached Metal Rates
  const { data: goldRate, isValidating: isSyncingRates, refetch: refetchRates } = useCachedApi('/gold-rate/', { ttl: 60000 });
  
  const rate24k = Number(goldRate?.gold_rate_24k) || 7250;
  const rate22k = Number(goldRate?.gold_rate_22k) || Math.round((rate24k * 22) / 24);
  const rate18k = Number(goldRate?.gold_rate_18k) || Math.round((rate24k * 18) / 24);
  const silverRate = Number(goldRate?.silver_rate) || 89;

  // Single-Page Customer Details State
  const [customerForm, setCustomerForm] = useState({
    phone: '',
    name: '',
    address: '',
    email: ''
  });
  const [matchedCustomer, setMatchedCustomer] = useState(null);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [showNameSearchDropdown, setShowNameSearchDropdown] = useState(false);
  const [nameSearchQuery, setNameSearchQuery] = useState('');

  // Bill Items Cart State
  const [selectedItems, setSelectedItems] = useState([]);

  // Streamlined Inline Item Entry State (replaces separate stock & manual modals)
  const [itemEntry, setItemEntry] = useState({
    name: '',
    selectedStockItem: null,
    metal_type: 'Gold',
    purity: 22,
    weight: '',
    customRate: '', // empty means auto-compute from active metal rate
    making_charge_mode: 'rupees_per_gram', // 'rupees_per_gram', 'flat_rupees', 'percentage'
    making_charges: '',
    wastage_percentage: 0,
    quantity: 1,
    description: ''
  });

  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [showStockDropdown, setShowStockDropdown] = useState(false);

  // Billing Calculation & Checkout State
  // Requirement 5: GST toggle OFF by default
  const [applyGst, setApplyGst] = useState(false); 
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [paymentStatusType, setPaymentStatusType] = useState('paid'); // 'paid', 'partial', 'unpaid'
  const [paidAmountInput, setPaidAmountInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [creatingBill, setCreatingBill] = useState(false);

  // Last generated bill for instant print / view modal
  const [completedBill, setCompletedBill] = useState(null);

  // Debounced searches
  const debouncedPhone = useDebounce(customerForm.phone, 250);
  const debouncedNameSearch = useDebounce(nameSearchQuery, 200);
  const debouncedStockSearch = useDebounce(stockSearchQuery, 200);

  // Search customers by name or phone
  const { data: rawCustByName } = useCachedApi(
    debouncedNameSearch ? `/customers/?search=${encodeURIComponent(debouncedNameSearch)}` : '/customers/',
    { ttl: 30000, initialData: [] }
  );
  const customerNameSuggestions = Array.isArray(rawCustByName) ? rawCustByName : [];

  // Stock inventory suggestions for streamlined item entry
  const { data: rawStockResults } = useCachedApi(
    debouncedStockSearch ? `/inventory/?search=${encodeURIComponent(debouncedStockSearch)}` : '/inventory/',
    { ttl: 30000, initialData: [] }
  );
  const stockSuggestions = Array.isArray(rawStockResults) ? rawStockResults : [];

  // Check phone number dynamically to auto-fill customer details without duplicates
  useEffect(() => {
    const cleanPhone = (customerForm.phone || '').trim().replace(/\D/g, '');
    if (cleanPhone.length >= 8) {
      let isSubscribed = true;
      setIsSearchingCustomer(true);

      api.get(`/customers/?search=${encodeURIComponent(cleanPhone)}`)
        .then(res => {
          if (!isSubscribed) return;
          const found = (res.data || []).find(c => (c.phone || '').replace(/\D/g, '') === cleanPhone);
          if (found) {
            setMatchedCustomer(found);
            setCustomerForm(prev => ({
              ...prev,
              name: found.name || prev.name,
              address: found.address || prev.address,
              email: found.email || prev.email
            }));
          } else {
            setMatchedCustomer(null);
          }
        })
        .catch(() => {
          if (isSubscribed) setMatchedCustomer(null);
        })
        .finally(() => {
          if (isSubscribed) setIsSearchingCustomer(false);
        });

      return () => { isSubscribed = false; };
    } else {
      setMatchedCustomer(null);
    }
  }, [debouncedPhone]);

  // Select customer from autocomplete dropdown
  const handleSelectCustomer = (cust) => {
    setMatchedCustomer(cust);
    setCustomerForm({
      phone: cust.phone || '',
      name: cust.name || '',
      address: cust.address || '',
      email: cust.email || ''
    });
    setShowNameSearchDropdown(false);
    setNameSearchQuery('');
  };

  const handleClearCustomer = () => {
    setMatchedCustomer(null);
    setCustomerForm({
      phone: '',
      name: '',
      address: '',
      email: ''
    });
  };

  // Streamlined Item Selection from Inventory
  const handleSelectStockItem = (inv) => {
    setItemEntry({
      name: inv.name,
      selectedStockItem: inv,
      metal_type: inv.metal_type?.toLowerCase() === 'silver' ? 'Silver' : 'Gold',
      purity: Number(inv.purity) || 22,
      weight: (inv.weight || '').toString(),
      customRate: '',
      making_charge_mode: 'rupees_per_gram',
      making_charges: (inv.making_charges || '').toString(),
      wastage_percentage: inv.wastage_percentage || 0,
      quantity: 1,
      description: inv.description || ''
    });
    setStockSearchQuery('');
    setShowStockDropdown(false);
  };

  // Calculate live unit rate for item entry
  const currentItemRate = useMemo(() => {
    if (itemEntry.customRate && parseFloat(itemEntry.customRate) > 0) {
      return parseFloat(itemEntry.customRate);
    }
    return getEffectiveRate(goldRate, itemEntry.metal_type, itemEntry.purity);
  }, [goldRate, itemEntry.metal_type, itemEntry.purity, itemEntry.customRate]);

  // Compute live preview of the item being entered
  const liveItemPreview = useMemo(() => {
    const weight = parseFloat(itemEntry.weight) || 0;
    const qty = parseInt(itemEntry.quantity, 10) || 1;
    const rate = currentItemRate;
    const metalVal = weight * rate;

    let makingVal = 0;
    const makingInput = parseFloat(itemEntry.making_charges) || 0;
    if (itemEntry.making_charge_mode === 'rupees_per_gram') {
      makingVal = weight * makingInput;
    } else if (itemEntry.making_charge_mode === 'flat_rupees') {
      makingVal = makingInput;
    } else if (itemEntry.making_charge_mode === 'percentage') {
      makingVal = (metalVal * makingInput) / 100;
    }

    const wastagePct = parseFloat(itemEntry.wastage_percentage) || 0;
    const wastageVal = metalVal * (wastagePct / 100);

    const unitSubtotal = metalVal + makingVal + wastageVal;
    const totalSubtotal = unitSubtotal * qty;

    return {
      rate,
      metalVal,
      makingVal,
      wastageVal,
      unitSubtotal,
      totalSubtotal
    };
  }, [itemEntry, currentItemRate]);

  // Streamlined "+ Add to Bill" (No separate modal or buttons)
  const handleAddItemToBill = () => {
    const name = itemEntry.name.trim();
    if (!name) {
      toast.error('Please enter jewellery item name');
      return;
    }
    const weight = parseFloat(itemEntry.weight);
    if (isNaN(weight) || weight <= 0) {
      toast.error('Please enter a valid gross weight (greater than 0g)');
      return;
    }
    const qty = parseInt(itemEntry.quantity, 10) || 1;
    if (qty < 1) {
      toast.error('Quantity must be at least 1');
      return;
    }

    const stock = itemEntry.selectedStockItem;
    if (stock && qty > stock.stock_quantity) {
      toast.error(`Only ${stock.stock_quantity} available in stock for ${stock.name}`);
      return;
    }

    const preview = liveItemPreview;
    const isManual = !stock;

    const newItem = {
      unique_id: stock ? `stock_${stock.id}_${Date.now()}` : `custom_${Date.now()}_${Math.random()}`,
      is_manual: isManual,
      jewellery_id: stock ? stock.id : null,
      name: name,
      quantity: qty,
      weight: weight,
      item_details: {
        id: stock ? stock.id : null,
        name: name,
        product_code: stock ? stock.product_code : 'CUSTOM',
        metal_type: itemEntry.metal_type,
        purity: itemEntry.metal_type === 'Silver' ? 0 : Number(itemEntry.purity) || 22,
        weight: weight,
        making_charges: itemEntry.making_charge_mode === 'rupees_per_gram' ? parseFloat(itemEntry.making_charges) || 0 : (weight > 0 ? preview.makingVal / weight : 0),
        wastage_percentage: parseFloat(itemEntry.wastage_percentage) || 0,
        description: itemEntry.description || '',
        image_url: stock?.image_url || '',
        stock_quantity: stock?.stock_quantity || 999
      },
      making_type: itemEntry.making_charge_mode === 'percentage' ? 'percentage' : 'fixed',
      making_value: itemEntry.making_charge_mode === 'percentage' ? (parseFloat(itemEntry.making_charges) || 0) : preview.makingVal,
      base_product_value: preview.metalVal,
      rate: preview.rate,
      total: preview.totalSubtotal
    };

    setSelectedItems(prev => [...prev, newItem]);
    toast.success(`"${name}" added to invoice`);

    // Reset item entry form for next item
    setItemEntry({
      name: '',
      selectedStockItem: null,
      metal_type: 'Gold',
      purity: 22,
      weight: '',
      customRate: '',
      making_charge_mode: 'rupees_per_gram',
      making_charges: '',
      wastage_percentage: 0,
      quantity: 1,
      description: ''
    });
    setStockSearchQuery('');
  };

  const updateQuantity = (index, delta) => {
    setSelectedItems(prev => {
      const updated = [...prev];
      const item = updated[index];
      const newQty = item.quantity + delta;
      if (newQty < 1) return prev;
      
      if (!item.is_manual && item.item_details && newQty > item.item_details.stock_quantity) {
        toast.error(`Only ${item.item_details.stock_quantity} available in stock`);
        return prev;
      }
      
      const unitTotal = item.quantity > 0 ? (item.total / item.quantity) : item.total;
      updated[index] = { 
        ...item, 
        quantity: newQty,
        total: unitTotal * newQty
      };
      return updated;
    });
  };

  const removeItem = (index) => {
    setSelectedItems(prev => prev.filter((_, i) => i !== index));
  };

  // Bill Totals Calculation
  const calculateBillTotals = () => {
    let grossGoldValue = 0;
    let grossMakingCharges = 0;
    let grossWastage = 0;
    let manualItemsTotal = 0;

    selectedItems.forEach(cartItem => {
      const item = cartItem.item_details || {};
      const qty = cartItem.quantity;
      const weight = Number(item.weight) || 0;
      const purity = Number(item.purity) || 22;
      const wastagePct = Number(item.wastage_percentage) || 0;

      const rate = cartItem.rate || getEffectiveRate(goldRate, item.metal_type, purity);
      const singleMetalVal = weight * rate;
      const itemMetalValue = singleMetalVal * qty;

      let singleMakingVal = 0;
      if (cartItem.making_type === 'percentage') {
        singleMakingVal = (singleMetalVal * (Number(cartItem.making_value) || 0)) / 100;
      } else {
        singleMakingVal = Number(cartItem.making_value) || 0;
      }
      const itemMaking = singleMakingVal * qty;
      const itemWastage = itemMetalValue * (wastagePct / 100);

      grossGoldValue += itemMetalValue;
      grossMakingCharges += itemMaking;
      grossWastage += itemWastage;
    });

    const grossSubtotal = grossGoldValue + grossMakingCharges + grossWastage + manualItemsTotal;

    // Smart Discount deduction
    const discAmt = parseFloat(discountAmount) || 0;
    const taxableAmount = Math.max(0, grossSubtotal - discAmt);

    // GST (3%) ON/OFF toggle calculation (OFF by default)
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

  // Compute live paid and pending amounts
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

  // Submit and Save Bill (Creates customer automatically if new!)
  const handleCreateBill = async () => {
    const phone = (customerForm.phone || '').trim();
    const name = (customerForm.name || '').trim();

    if (!phone || !name) {
      toast.error('Please enter customer phone number and name');
      return;
    }

    if (selectedItems.length === 0) {
      toast.error('Please add at least one jewellery item to the bill');
      return;
    }

    setCreatingBill(true);

    try {
      const billPayload = {
        customer_id: matchedCustomer ? matchedCustomer.id : undefined,
        customer_name: name,
        customer_phone: phone,
        customer_address: customerForm.address.trim() || undefined,
        customer_email: customerForm.email.trim() || undefined,
        items: selectedItems.map(i => {
          const details = i.item_details || {};
          const itemWeight = Number(details.weight ?? i.weight) || 0;
          const itemPurity = details.metal_type === 'Silver' ? 0 : (Number(details.purity) || 22);
          const itemRate = Number(i.rate) || 0;
          const itemTotal = Number(i.total) || 0;

          return {
            jewellery_id: i.jewellery_id || null,
            is_manual: Boolean(i.is_manual),
            name: (i.name || details.name || 'Jewellery Item').trim(),
            quantity: i.quantity,
            metal_type: details.metal_type || 'Gold',
            purity: itemPurity,
            weight: itemWeight,
            wastage_percentage: Number(details.wastage_percentage) || 0,
            making_charges_type: i.making_type || 'fixed',
            making_charges_value: Number(i.making_value || 0),
            rate: itemRate,
            rate_per_gram: itemRate,
            total: itemTotal
          };
        }),
        apply_gst: applyGst,
        discount_amount: parseFloat(discountAmount) || 0,
        discount_percentage: parseFloat(discountPercent) || 0,
        paid_amount: computedPaidAmount,
        payment_status: paymentStatusType === 'paid' ? 'paid' : paymentStatusType === 'unpaid' ? 'unpaid' : 'partial',
        payment_method: paymentMethod,
        notes: notes.trim() || undefined
      };

      const response = await api.post('/billing/', billPayload);
      const generatedBill = response.data;
      setCompletedBill(generatedBill);
      toast.success(`Invoice ${generatedBill.invoice_number} created successfully!`);

      // Invalidate relevant caches
      invalidateCache('/dashboard');
      invalidateCache('/billing');
      invalidateCache('/billing/dues');
      invalidateCache('/inventory');
      invalidateCache('/customers');

      // Auto-trigger PDF download
      handleDownloadInvoicePDF(generatedBill.id, generatedBill.invoice_number);

      // Reset cart and checkout fields for next bill
      setSelectedItems([]);
      setDiscountAmount('');
      setDiscountPercent('');
      setPaymentStatusType('paid');
      setPaidAmountInput('');
      setNotes('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create invoice');
    } finally {
      setCreatingBill(false);
    }
  };

  const handleDownloadInvoicePDF = async (billId, invoiceNum) => {
    try {
      const pdfResponse = await api.get(`/billing/${billId}/pdf`, {
        responseType: 'blob'
      });
      const blobUrl = window.URL.createObjectURL(new Blob([pdfResponse.data], { type: 'application/pdf' }));
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.setAttribute('download', `${invoiceNum || 'invoice'}.pdf`);
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
    } catch (err) {
      console.warn('PDF download failed:', err);
      toast.error('Failed to download PDF invoice');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Banner with Live Metal Rates */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Point of Sale & Billing</h1>
            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-extrabold uppercase rounded-full">
              Single-Screen Workflow
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Seamlessly capture customer info, configure line items, manage dues, and print tax invoices all in one place
          </p>
        </div>

        {/* Live Active Rates Ribbon */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-300/80 rounded-xl text-xs font-semibold text-slate-800">
            <span className="text-amber-800 font-bold flex items-center gap-1">
              <IoDiamondOutline className="text-amber-600" />
              Live Rates:
            </span>
            <span className="font-mono">24K: <b>₹{rate24k.toLocaleString('en-IN')}</b></span>
            <span className="text-slate-300">|</span>
            <span className="font-mono text-amber-900">22K: <b>₹{rate22k.toLocaleString('en-IN')}</b></span>
            <span className="text-slate-300">|</span>
            <span className="font-mono text-slate-700">18K: <b>₹{rate18k.toLocaleString('en-IN')}</b></span>
            <span className="text-slate-300">|</span>
            <span className="font-mono text-slate-700">Silver: <b>₹{silverRate}/g</b></span>
          </div>

          <button
            onClick={() => refetchRates()}
            title="Refresh Metal Rates"
            className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition"
          >
            <FiRefreshCw size={13} className={isSyncingRates ? 'animate-spin text-amber-600' : ''} />
          </button>
        </div>
      </div>

      {/* Main Single-Screen Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT 2 COLS: CUSTOMER DETAILS & STREAMLINED ITEM BUILDER & BILL TABLE */}
        <div className="lg:col-span-2 space-y-5">
          
          {/* 1. TOP CUSTOMER DETAILS CARD */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                  <FiUser size={15} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Customer Details</h2>
                  <p className="text-[10px] text-slate-400">Phone lookup auto-fills existing customer or auto-creates when invoice is saved</p>
                </div>
              </div>

              {matchedCustomer ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                    <FiCheck size={12} /> Existing: {matchedCustomer.customer_id}
                  </span>
                  <button
                    type="button"
                    onClick={handleClearCustomer}
                    className="text-[11px] text-rose-500 hover:underline font-semibold"
                  >
                    Clear
                  </button>
                </div>
              ) : customerForm.phone.trim().length >= 8 ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                  <FiPlus size={11} /> New Customer (Will auto-save)
                </span>
              ) : null}
            </div>

            {/* Customer Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Phone Input with Auto-check */}
              <div className="relative">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mobile Number *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                    <FiPhone size={13} />
                  </div>
                  <input
                    type="tel"
                    required
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                    placeholder="e.g. 9876543210"
                    className={`w-full pl-8 pr-7 py-2 text-xs sm:text-sm bg-slate-50 border rounded-xl outline-none font-semibold transition ${
                      matchedCustomer
                        ? 'border-emerald-300 ring-2 ring-emerald-500/10 bg-emerald-50/20 text-slate-900'
                        : 'border-slate-200 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500'
                    }`}
                  />
                  {isSearchingCustomer && (
                    <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
                      <FiRefreshCw className="animate-spin text-amber-600 text-xs" />
                    </div>
                  )}
                </div>
              </div>

              {/* Customer Full Name */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Customer Name *</label>
                  {/* Quick Directory Selector */}
                  <button
                    type="button"
                    onClick={() => setShowNameSearchDropdown(!showNameSearchDropdown)}
                    className="text-[10px] text-amber-600 hover:underline font-semibold"
                  >
                    Directory
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                    <FiUser size={13} />
                  </div>
                  <input
                    type="text"
                    required
                    value={customerForm.name}
                    onChange={(e) => {
                      setCustomerForm({ ...customerForm, name: e.target.value });
                      setNameSearchQuery(e.target.value);
                    }}
                    placeholder="e.g. Rajesh Sharma"
                    className="w-full pl-8 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-semibold text-slate-900"
                  />
                </div>

                {/* Directory Autocomplete Dropdown */}
                {showNameSearchDropdown && customerNameSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {customerNameSuggestions.slice(0, 6).map((c) => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        className="p-2.5 hover:bg-amber-50/60 cursor-pointer text-xs flex items-center justify-between"
                      >
                        <div>
                          <p className="font-bold text-slate-800">{c.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{c.phone} • {c.customer_id}</p>
                        </div>
                        <span className="text-[10px] font-bold text-amber-600">Select</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Address / City */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Residential Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                    <FiMapPin size={13} />
                  </div>
                  <input
                    type="text"
                    value={customerForm.address}
                    onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                    placeholder="City, Area or Street"
                    className="w-full pl-8 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-slate-800"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email (Optional)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                    <FiMail size={13} />
                  </div>
                  <input
                    type="email"
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                    placeholder="customer@email.com"
                    className="w-full pl-8 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-slate-800"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. STREAMLINED INLINE ITEM BUILDER (Single unified entry panel) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                  <FiBox size={15} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Add Jewellery Item</h2>
                  <p className="text-[10px] text-slate-400">Search stock catalogue or type any custom bespoke item directly</p>
                </div>
              </div>

              {itemEntry.selectedStockItem ? (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  Stock Item: {itemEntry.selectedStockItem.product_code} (Qty: {itemEntry.selectedStockItem.stock_quantity})
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                  Custom / Direct Item
                </span>
              )}
            </div>

            {/* Row 1: Item Name with Stock Autocomplete */}
            <div className="relative">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Item / Ornament Name *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <FiSearch size={14} />
                </div>
                <input
                  type="text"
                  value={itemEntry.name}
                  onChange={(e) => {
                    setItemEntry({ ...itemEntry, name: e.target.value, selectedStockItem: null });
                    setStockSearchQuery(e.target.value);
                    setShowStockDropdown(true);
                  }}
                  onFocus={() => setShowStockDropdown(true)}
                  placeholder="Type item name or search inventory (e.g. 22K Bridal Gold Necklace, Ring)..."
                  className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-semibold text-slate-900"
                />
                {itemEntry.name && (
                  <button
                    type="button"
                    onClick={() => {
                      setItemEntry(prev => ({ ...prev, name: '', selectedStockItem: null }));
                      setStockSearchQuery('');
                    }}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    <FiX size={14} />
                  </button>
                )}
              </div>

              {/* Autocomplete Stock Dropdown */}
              {showStockDropdown && stockSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto divide-y divide-slate-100">
                  <div className="p-2 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Available Stock Matches ({stockSuggestions.length})
                  </div>
                  {stockSuggestions.slice(0, 8).map((inv) => (
                    <div
                      key={inv.id}
                      onClick={() => handleSelectStockItem(inv)}
                      className="p-3 hover:bg-amber-50/70 cursor-pointer flex items-center justify-between text-xs transition"
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
                          <p className="font-bold text-slate-800">{inv.name}</p>
                          <p className="text-[11px] text-slate-400">
                            {inv.product_code} • {inv.metal_type} {inv.metal_type?.toLowerCase() === 'gold' ? `${inv.purity}K` : ''} • {inv.weight}g • Stock: <b>{inv.stock_quantity}</b>
                          </p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-[11px]">
                        + Select Stock
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Row 2: Metal, Purity, Weight, Rate, Making & Wastage */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Metal Type */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Metal Type</label>
                <select
                  value={itemEntry.metal_type}
                  onChange={(e) => {
                    const val = e.target.value;
                    setItemEntry(prev => ({
                      ...prev,
                      metal_type: val,
                      purity: val === 'Silver' ? 0 : 22
                    }));
                  }}
                  className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 outline-none font-semibold text-slate-800"
                >
                  <option value="Gold">Gold</option>
                  <option value="Silver">Silver</option>
                </select>
              </div>

              {/* Purity */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Purity</label>
                {itemEntry.metal_type === 'Silver' ? (
                  <div className="w-full px-2.5 py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-600">
                    Fine (999)
                  </div>
                ) : (
                  <select
                    value={itemEntry.purity}
                    onChange={(e) => setItemEntry({ ...itemEntry, purity: parseFloat(e.target.value) })}
                    className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 outline-none font-semibold text-slate-800"
                  >
                    <option value={22}>22K (91.6% Hallmark)</option>
                    <option value={24}>24K (99.9% Pure)</option>
                    <option value={18}>18K (75.0%)</option>
                    <option value={14}>14K (58.5%)</option>
                  </select>
                )}
              </div>

              {/* Gross Weight (g) */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Weight (g) *</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  value={itemEntry.weight}
                  onChange={(e) => setItemEntry({ ...itemEntry, weight: e.target.value })}
                  placeholder="e.g. 10.50"
                  className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 outline-none font-bold text-slate-900"
                />
              </div>

              {/* Metal Rate / gram */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-semibold text-slate-700">Rate / g (₹)</label>
                  <span className="text-[9px] text-amber-700 font-medium">Live</span>
                </div>
                <input
                  type="number"
                  step="1"
                  value={itemEntry.customRate || currentItemRate}
                  onChange={(e) => setItemEntry({ ...itemEntry, customRate: e.target.value })}
                  className="w-full px-2.5 py-2 text-xs bg-amber-50/50 border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 outline-none font-bold text-amber-900"
                  title="Auto-filled from live metal rate. Edit to override."
                />
              </div>

              {/* Making Charge Mode & Value */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Making {itemEntry.making_charge_mode === 'percentage' ? '(%)' : '(₹)'}
                </label>
                <div className="flex rounded-xl border border-slate-200 bg-slate-50 overflow-hidden focus-within:ring-2 focus-within:ring-amber-500/20">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={itemEntry.making_charges}
                    onChange={(e) => setItemEntry({ ...itemEntry, making_charges: e.target.value })}
                    placeholder={itemEntry.making_charge_mode === 'percentage' ? 'e.g. 12%' : 'e.g. 450'}
                    className="w-full px-2 py-2 text-xs bg-transparent outline-none font-semibold text-slate-900"
                  />
                  <select
                    value={itemEntry.making_charge_mode}
                    onChange={(e) => setItemEntry({ ...itemEntry, making_charge_mode: e.target.value })}
                    className="text-[10px] bg-slate-100 border-l border-slate-200 px-1 py-1 font-bold text-slate-700 outline-none"
                  >
                    <option value="rupees_per_gram">₹/g</option>
                    <option value="percentage">%</option>
                    <option value="flat_rupees">Flat ₹</option>
                  </select>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Qty</label>
                <input
                  type="number"
                  min="1"
                  value={itemEntry.quantity}
                  onChange={(e) => setItemEntry({ ...itemEntry, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                  className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 outline-none font-bold text-slate-900 text-center"
                />
              </div>
            </div>

            {/* Row 3: Live Item Subtotal Preview & "+ Add to Bill" Button */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs flex-wrap font-medium text-slate-500">
                <span>Metal: <b className="text-slate-800">₹{Math.round(liveItemPreview.metalVal).toLocaleString('en-IN')}</b></span>
                <span>•</span>
                <span>Making: <b className="text-slate-800">₹{Math.round(liveItemPreview.makingVal).toLocaleString('en-IN')}</b></span>
                {liveItemPreview.wastageVal > 0 && (
                  <>
                    <span>•</span>
                    <span>Wastage: <b className="text-slate-800">₹{Math.round(liveItemPreview.wastageVal).toLocaleString('en-IN')}</b></span>
                  </>
                )}
                <span>•</span>
                <span className="text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  Item Total: ₹{Math.round(liveItemPreview.totalSubtotal).toLocaleString('en-IN')}
                </span>
              </div>

              <button
                type="button"
                onClick={handleAddItemToBill}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs rounded-xl shadow-sm shadow-amber-500/20 transition flex items-center justify-center gap-1.5 shrink-0"
              >
                <FiPlus size={15} />
                <span>+ Add Item to Bill</span>
              </button>
            </div>
          </div>

          {/* 3. CURRENT INVOICE ITEMS TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Bill Items ({selectedItems.length})
                </h3>
                {selectedItems.length > 0 && (
                  <span className="text-xs text-slate-500">
                    Total Weight: <b>{selectedItems.reduce((sum, it) => sum + (Number(it.item_details?.weight) || 0) * it.quantity, 0).toFixed(2)}g</b>
                  </span>
                )}
              </div>

              {selectedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedItems([])}
                  className="text-xs text-rose-500 hover:text-rose-700 font-semibold"
                >
                  Clear All Items
                </button>
              )}
            </div>

            {selectedItems.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                  <FiBox size={22} />
                </div>
                <h4 className="text-xs font-bold text-slate-700">No items added to this bill yet</h4>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Search stock or type custom ornament details in the section above and click <b>"+ Add Item to Bill"</b>
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100 text-[11px] text-slate-500 font-semibold">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Item Description</th>
                      <th className="py-2.5 px-3">Metal / Purity</th>
                      <th className="py-2.5 px-3 text-right">Net Wt (g)</th>
                      <th className="py-2.5 px-3 text-right">Rate / g</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Total (₹)</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedItems.map((cartItem, idx) => {
                      const item = cartItem.item_details || {};
                      const itemRate = cartItem.rate || getEffectiveRate(goldRate, item.metal_type, item.purity);
                      const itemSubtotal = ((Number(item.weight) || 0) * itemRate + Number(cartItem.making_value || 0)) * cartItem.quantity;
                      
                      return (
                        <tr key={cartItem.unique_id || idx} className="hover:bg-slate-50/60 transition">
                          <td className="py-3 px-3 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-800">{cartItem.name}</div>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                              cartItem.is_manual ? 'bg-purple-50 text-purple-700' : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              {cartItem.is_manual ? 'Custom Item' : `Stock: ${item.product_code || 'INV'}`}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-semibold text-slate-700">
                              {item.metal_type} {item.metal_type?.toLowerCase() === 'gold' ? `${item.purity}K` : '999'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-slate-900">
                            {Number(item.weight).toFixed(2)}g
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600">
                            ₹{Math.round(itemRate).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => updateQuantity(idx, -1)}
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs"
                              >
                                -
                              </button>
                              <span className="w-6 text-center font-bold text-slate-900">{cartItem.quantity}</span>
                              <button
                                type="button"
                                onClick={() => updateQuantity(idx, 1)}
                                className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-slate-900 text-sm">
                            ₹{Math.round(itemSubtotal).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Remove item"
                            >
                              <FiTrash2 size={13} />
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

        {/* RIGHT COL: BILL SUMMARY & PAYMENT CHECKOUT */}
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4 sticky top-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FiDollarSign className="text-amber-600" />
                Invoice Summary & Checkout
              </h2>
              <span className="text-[11px] text-slate-400">
                {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Calculations Breakdown */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Gross Metal Value:</span>
                <span className="font-semibold text-slate-800">
                  ₹{Math.round(totals.grossGoldValue).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex justify-between text-slate-600">
                <span>Making Charges:</span>
                <span className="font-semibold text-slate-800">
                  ₹{Math.round(totals.grossMakingCharges).toLocaleString('en-IN')}
                </span>
              </div>

              {totals.grossWastage > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Wastage Charges:</span>
                  <span className="font-semibold text-slate-800">
                    ₹{Math.round(totals.grossWastage).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-slate-700 font-bold pt-1.5 border-t border-slate-100">
                <span>Items Subtotal:</span>
                <span>₹{Math.round(totals.grossSubtotal).toLocaleString('en-IN')}</span>
              </div>

              {/* Discount Section */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                    <FiPercent className="text-amber-600" />
                    Store Discount
                  </span>
                  {totals.discountAmount > 0 && (
                    <span className="text-[11px] font-bold text-emerald-700">
                      - ₹{Math.round(totals.discountAmount).toLocaleString('en-IN')}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={discountAmount}
                      onChange={(e) => handleDiscountAmountChange(e.target.value)}
                      placeholder="Discount (₹)"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none font-semibold text-slate-800"
                    />
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={discountPercent}
                      onChange={(e) => handleDiscountPercentChange(e.target.value)}
                      placeholder="Percent (%)"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none font-semibold text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* REQUIREMENT 5: GST TOGGLE DEFAULT OFF */}
              <div className={`p-3 rounded-xl border transition-all ${
                applyGst ? 'bg-amber-500/10 border-amber-300/80' : 'bg-slate-50 border-slate-200/80'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900">GST (3%)</span>
                      <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                        applyGst ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {applyGst ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {applyGst ? 'Tax added to final invoice (3% CGST+SGST)' : 'Tax-free invoice (GST 0%)'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {applyGst && (
                      <span className="text-xs font-extrabold text-amber-900">
                        + ₹{totals.gst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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
                      title={applyGst ? 'Click to disable GST' : 'Click to enable 3% GST'}
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
              </div>

              {/* Grand Total */}
              <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                <span className="text-sm font-bold text-slate-800">Final Total:</span>
                <span className="text-2xl font-black text-amber-800">
                  ₹{grandTotal.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Payment Settlement Mode: Full Paid, Partial / Advance, Unpaid Due */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <FiDollarSign className="text-amber-600" />
                  Payment Settlement
                </label>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full capitalize ${
                  paymentStatusType === 'paid'
                    ? 'bg-emerald-100 text-emerald-800'
                    : paymentStatusType === 'partial'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                }`}>
                  {paymentStatusType === 'paid' ? 'Full Paid' : paymentStatusType === 'partial' ? 'Partial / Due' : 'Credit / Unpaid'}
                </span>
              </div>

              {/* 3 Settlement Mode Buttons */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-white rounded-lg border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentStatusType('paid');
                    setPaidAmountInput('');
                  }}
                  className={`py-1.5 px-2 rounded-md font-bold text-center transition ${
                    paymentStatusType === 'paid'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Full Paid
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentStatusType('partial');
                    setPaidAmountInput(Math.round(grandTotal / 2).toString());
                  }}
                  className={`py-1.5 px-2 rounded-md font-bold text-center transition ${
                    paymentStatusType === 'partial'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Partial Due
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentStatusType('unpaid');
                    setPaidAmountInput('0');
                  }}
                  className={`py-1.5 px-2 rounded-md font-bold text-center transition ${
                    paymentStatusType === 'unpaid'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Full Due
                </button>
              </div>

              {/* Partial Payment Amount Input & Pending Amount Display */}
              {paymentStatusType === 'partial' && (
                <div className="space-y-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Received Amount Now (₹) *
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max={grandTotal}
                      value={paidAmountInput}
                      onChange={(e) => setPaidAmountInput(e.target.value)}
                      placeholder="e.g. 20000"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none font-bold text-emerald-800"
                    />
                  </div>

                  <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg flex justify-between items-center text-xs">
                    <span className="font-semibold text-rose-800">Remaining Balance Due:</span>
                    <span className="font-extrabold text-rose-600 text-sm">
                      ₹{computedPendingAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              )}

              {paymentStatusType === 'unpaid' && (
                <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg flex justify-between items-center text-xs">
                  <span className="font-semibold text-rose-800">Total Credit Due:</span>
                  <span className="font-extrabold text-rose-600 text-sm">
                    ₹{grandTotal.toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 outline-none font-semibold text-slate-800"
              >
                <option value="cash">Cash In Hand</option>
                <option value="upi">UPI / QR Code (GPay, PhonePe, Paytm)</option>
                <option value="card">Debit / Credit Card</option>
                <option value="bank_transfer">Bank NEFT / RTGS</option>
              </select>
            </div>

            {/* Optional Invoice Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Notes & Terms (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Balance due within 15 days"
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 outline-none text-slate-800"
              />
            </div>

            {/* SAVE & GENERATE INVOICE BUTTON */}
            <button
              type="button"
              disabled={creatingBill || selectedItems.length === 0}
              onClick={handleCreateBill}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-sm rounded-xl shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
            >
              {creatingBill ? (
                <>
                  <FiRefreshCw className="animate-spin" size={16} />
                  <span>Processing Invoice...</span>
                </>
              ) : (
                <>
                  <FiPrinter size={16} />
                  <span>Complete & Print Bill (₹{grandTotal.toLocaleString('en-IN')})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* COMPLETED INVOICE CONFIRMATION MODAL */}
      {completedBill && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
              <FiCheckCircle size={30} />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900">Invoice Created Successfully!</h3>
              <p className="text-xs font-mono font-bold text-amber-700 mt-1">
                {completedBill.invoice_number}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Customer: <b>{customerForm.name || completedBill.customer_name}</b> ({customerForm.phone})
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Invoice Total:</span>
                <span className="font-bold text-slate-900">₹{Math.round(completedBill.total_amount).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span>Amount Paid:</span>
                <span className="font-bold text-emerald-700">₹{Math.round(completedBill.paid_amount || completedBill.total_amount).toLocaleString('en-IN')}</span>
              </div>
              {Number(completedBill.pending_amount) > 0 && (
                <div className="flex justify-between text-rose-600 font-bold pt-1 border-t border-slate-200">
                  <span>Balance Due:</span>
                  <span>₹{Math.round(completedBill.pending_amount).toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleDownloadInvoicePDF(completedBill.id, completedBill.invoice_number)}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
              >
                <FiPrinter size={14} />
                <span>Download / Print PDF</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCompletedBill(null);
                  handleClearCustomer();
                }}
                className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-xl border border-amber-200 transition"
              >
                New Bill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;