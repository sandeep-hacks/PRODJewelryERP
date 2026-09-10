import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useCachedApi, invalidateCache } from '../utils/cache';
import { useDebounce } from '../utils/useDebounce';
import { TableSkeleton } from '../components/Skeleton';
import PurchasesSection from '../components/PurchasesSection';
import { 
  FiSearch, 
  FiPlus, 
  FiEdit3, 
  FiTrash2, 
  FiBox, 
  FiRefreshCw, 
  FiX, 
  FiUploadCloud, 
  FiImage, 
  FiCheckCircle, 
  FiList, 
  FiGrid, 
  FiExternalLink, 
  FiShield, 
  FiStar,
  FiShoppingBag,
  FiInfo,
  FiDollarSign,
  FiCalendar
} from 'react-icons/fi';
import { IoDiamondOutline } from 'react-icons/io5';

const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const rawBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const apiBase = rawBase.replace(/\/+$/, '');
  return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
};

const Inventory = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'purchases' ? 'purchases' : 'catalogue';
  const setActiveTab = (tab) => {
    if (tab === 'purchases') setSearchParams({ tab: 'purchases' });
    else setSearchParams({});
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [metalFilter, setMetalFilter] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' (Flipkart style) or 'table'
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showcaseItem, setShowcaseItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Debounce search term by 250ms for butter-smooth typing
  const debouncedSearch = useDebounce(searchTerm, 250);

  const queryUrl = `/inventory/?search=${encodeURIComponent(debouncedSearch)}&metal_type=${encodeURIComponent(metalFilter)}`;
  const { data: rawItems, loading, isValidating, error, refetch } = useCachedApi(queryUrl, { ttl: 60000, initialData: [] });
  const items = Array.isArray(rawItems) ? rawItems : [];

  // Live metal rates to compute real-time retail valuation on the fly
  const { data: goldRate } = useCachedApi('/gold-rate/', { ttl: 60000 });
  const rate24k = goldRate?.gold_rate_24k || 7250;
  const silverRate = goldRate?.silver_rate || 89;

  const [formData, setFormData] = useState({
    name: '',
    metal_type: 'Gold',
    purity: 22,
    weight: '',
    stock_quantity: '',
    making_charges: '',
    wastage_percentage: 0,
    description: '',
    image_url: ''
  });

  const resetForm = () => {
    setFormData({
      name: '',
      metal_type: 'Gold',
      purity: 22,
      weight: '',
      stock_quantity: '',
      making_charges: '',
      wastage_percentage: 0,
      description: '',
      image_url: ''
    });
    setEditingItem(null);
  };

  const handleOpenAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    const isSilver = item.metal_type?.toLowerCase() === 'silver';
    setFormData({
      name: item.name,
      metal_type: item.metal_type,
      purity: isSilver ? 0 : (item.purity || 22),
      weight: item.weight,
      stock_quantity: item.stock_quantity,
      making_charges: item.making_charges,
      wastage_percentage: item.wastage_percentage,
      description: item.description || '',
      image_url: item.image_url || ''
    });
    setShowAddModal(true);
  };

  // Upload image to ImageKit Cloud
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image size must be under 10MB');
      return;
    }

    setUploadingImage(true);
    const toastId = toast.loading('Uploading to ImageKit Cloud...');

    try {
      const uploadData = new FormData();
      uploadData.append('file', file);

      const res = await api.post('/inventory/upload-image', uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data?.url) {
        setFormData(prev => ({ ...prev, image_url: res.data.url }));
        toast.success('Uploaded to ImageKit Cloud!', { id: toastId });
      } else {
        toast.error('Upload succeeded but no URL returned', { id: toastId });
      }
    } catch (err) {
      console.error('Image upload failed:', err);
      toast.error('Image upload failed. Please try again.', { id: toastId });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const name = (formData.name || '').trim();
    if (!name) {
      toast.error('Please enter an item name');
      return;
    }

    const weight = parseFloat(formData.weight);
    if (isNaN(weight) || weight <= 0) {
      toast.error('Please enter a valid gross weight greater than 0');
      return;
    }

    const stockQty = parseInt(formData.stock_quantity, 10);
    if (isNaN(stockQty) || stockQty < 0) {
      toast.error('Please enter a valid stock quantity');
      return;
    }

    const isGold = (formData.metal_type || 'Gold').toLowerCase() === 'gold';
    const payload = {
      name,
      metal_type: formData.metal_type || 'Gold',
      purity: isGold ? (Number(formData.purity) || 22) : 0,
      weight,
      stock_quantity: stockQty,
      making_charges: parseFloat(formData.making_charges) || 0,
      wastage_percentage: parseFloat(formData.wastage_percentage) || 0,
      description: formData.description?.trim() || null,
      image_url: formData.image_url?.trim() || null,
    };

    setSubmitting(true);
    try {
      if (editingItem) {
        await api.put(`/inventory/${editingItem.id}`, payload);
        toast.success('Jewellery item updated');
      } else {
        await api.post('/inventory/', payload);
        toast.success('New jewellery item added to stock');
      }
      
      setShowAddModal(false);
      resetForm();
      invalidateCache('/inventory');
      invalidateCache('/dashboard');
      refetch();
    } catch (error) {
      console.error('Inventory submit error:', error);
      let errorMsg = 'Operation failed';
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        if (typeof detail === 'string') {
          errorMsg = detail;
        } else if (Array.isArray(detail)) {
          errorMsg = detail.map(d => d.msg || `${d.loc?.slice(-1)[0] || 'field'}: invalid`).join(', ');
        } else if (typeof detail === 'object') {
          errorMsg = JSON.stringify(detail);
        }
      } else if (error.message) {
        errorMsg = error.message;
      }
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to remove "${name}" from stock?`)) {
      try {
        await api.delete(`/inventory/${id}`);
        toast.success('Item deleted successfully');
        invalidateCache('/inventory');
        invalidateCache('/dashboard');
        refetch();
        if (showcaseItem?.id === id) setShowcaseItem(null);
      } catch (error) {
        toast.error('Failed to delete item');
      }
    }
  };

  // Real-time calculation helper
  const calculateItemPrice = (item) => {
    const isGold = item.metal_type?.toLowerCase() === 'gold';
    const baseRate = isGold ? rate24k : silverRate;
    const weight = Number(item.weight) || 0;
    const purity = Number(item.purity) || 22;
    const makingPerGram = Number(item.making_charges) || 0;
    const wastage = Number(item.wastage_percentage) || 0;

    // For Gold: weight * rate24k * (purity / 24). For Silver: weight * silverRate
    const metalValue = isGold ? weight * baseRate * (purity / 24) : weight * baseRate;
    const totalMaking = weight * makingPerGram;
    const wastageCharges = metalValue * (wastage / 100);
    const subtotal = metalValue + totalMaking + wastageCharges;
    const gst = subtotal * 0.03;
    const total = subtotal + gst;

    return { baseRate, goldValue: metalValue, metalValue, totalMaking, wastageCharges, subtotal, gst, total };
  };

  return (
    <div className="space-y-6">
      {/* Sub Navigation Tabs */}
      <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-xs w-full sm:w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('catalogue')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'catalogue'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FiBox size={14} />
          <span>Stock Catalogue ({items.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('purchases')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'purchases'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FiShoppingBag size={14} />
          <span>Supplier Purchases</span>
        </button>
      </div>

      {activeTab === 'purchases' ? (
        <PurchasesSection />
      ) : (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Jewellery Inventory</h1>
            {isValidating && (
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                <FiRefreshCw className="animate-spin text-[9px]" /> Updating
              </span>
            )}
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Manage ornaments, stock counts, purity levels & ImageKit assets</p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="w-full sm:w-auto justify-center flex items-center gap-1.5 px-3.5 py-2 sm:px-4 sm:py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-medium text-xs sm:text-sm rounded-xl shadow-sm shadow-amber-500/20 transition-all active:scale-[0.98]"
        >
          <FiPlus size={15} />
          <span>Add Jewellery Item</span>
        </button>
      </div>

      {/* Filters & View Switcher Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-center justify-between">
        {/* Search */}
        <div className="flex-1 relative w-full sm:max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <FiSearch size={15} />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 sm:py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
            placeholder="Search jewellery by name or code..."
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
            >
              <FiX size={13} />
            </button>
          )}
        </div>

        {/* Filters and View Switcher */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <select
            value={metalFilter}
            onChange={(e) => setMetalFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition text-slate-700 font-medium"
          >
            <option value="">All Metals</option>
            <option value="Gold">Gold</option>
            <option value="Silver">Silver</option>
          </select>

          {/* View Mode Toggle (Flipkart Showcase vs Table) */}
          <div className="flex items-center p-0.5 sm:p-1 bg-slate-100 rounded-xl border border-slate-200/80">
            <button
              onClick={() => setViewMode('grid')}
              title="Flipkart Showcase Grid"
              className={`flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'grid'
                  ? 'bg-white text-amber-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FiGrid size={13} />
              <span>Showcase</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Tabular List View"
              className={`flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'table'
                  ? 'bg-white text-amber-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FiList size={13} />
              <span>Table</span>
            </button>
          </div>

          <button
            onClick={() => refetch()}
            title="Refresh list"
            className="p-2 sm:p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition border border-slate-200"
          >
            <FiRefreshCw size={14} className={isValidating ? 'animate-spin text-amber-600' : ''} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {error && items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-rose-200 p-6 sm:p-8 text-center shadow-sm">
          <p className="text-xs sm:text-sm font-semibold text-rose-700">Failed to retrieve inventory stock.</p>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-1">{error.message || 'Please check your connection and login status.'}</p>
          <button
            onClick={() => refetch()}
            className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <FiRefreshCw size={13} /> Retry Connection
          </button>
        </div>
      ) : loading && items.length === 0 ? (
        <TableSkeleton rows={6} cols={6} />
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-8 sm:p-12 text-center shadow-sm">
          <FiBox className="w-10 h-10 sm:w-12 sm:h-12 text-slate-300 mx-auto mb-2 sm:mb-3" />
          <h3 className="text-xs sm:text-sm font-semibold text-slate-700">No jewellery items found</h3>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
            {searchTerm || metalFilter ? 'Try adjusting your filters.' : 'Add your first piece of jewellery with ImageKit photography.'}
          </p>
          {!searchTerm && !metalFilter && (
            <button
              onClick={handleOpenAddModal}
              className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 text-white rounded-xl text-xs font-semibold hover:bg-amber-600 transition"
            >
              <FiPlus size={14} /> Add First Item
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* FLIPKART STYLE PRODUCT SHOWCASE GRID - 2 COLUMNS ON MOBILE, 3 ON TABLET, 4 ON DESKTOP */
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {items.map((item) => {
            const pricing = calculateItemPrice(item);
            return (
              <div
                key={item.id}
                className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden group"
              >
                {/* Product Image Container */}
                <div 
                  onClick={() => setShowcaseItem(item)}
                  className="relative aspect-square w-full bg-slate-100 overflow-hidden cursor-pointer"
                >
                  {item.image_url ? (
                    <img
                      src={getImageUrl(item.image_url)}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-tr from-amber-50 via-slate-50 to-amber-100/50 p-2 sm:p-6 text-center">
                      <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center mb-1">
                        <IoDiamondOutline className="w-5 h-5 sm:w-7 sm:h-7" />
                      </div>
                      <span className="text-[10px] sm:text-xs font-medium text-slate-400">No Image</span>
                    </div>
                  )}

                  {/* Metal Type & Hallmark Badges Overlay */}
                  <div className="absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 flex flex-col gap-1 items-start">
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 sm:px-2.5 sm:py-0.5 rounded-full text-[8px] sm:text-[10px] font-bold tracking-wide uppercase backdrop-blur shadow-xs ${
                      item.metal_type?.toLowerCase() === 'silver'
                        ? 'bg-slate-800/90 text-slate-100 border border-slate-600/60'
                        : 'bg-slate-900/85 text-amber-400'
                    }`}>
                      {item.metal_type?.toLowerCase() === 'silver' ? 'Silver' : `${item.metal_type} ${item.purity}K`}
                    </span>
                    {item.metal_type?.toLowerCase() === 'gold' && item.purity >= 22 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold uppercase bg-amber-500 text-slate-950 shadow-xs">
                        <FiShield size={8} className="sm:hidden" />
                        <FiShield size={10} className="hidden sm:inline" />
                        <span>BIS 916</span>
                      </span>
                    )}
                  </div>

                  {/* Stock Status Pill */}
                  <div className="absolute top-1.5 right-1.5 sm:top-2.5 sm:right-2.5">
                    {item.stock_quantity > 3 ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-full text-[8px] sm:text-[10px] font-semibold bg-emerald-500 text-white shadow-xs">
                        In Stock ({item.stock_quantity})
                      </span>
                    ) : item.stock_quantity > 0 ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-full text-[8px] sm:text-[10px] font-semibold bg-amber-500 text-slate-950 shadow-xs">
                        Only {item.stock_quantity} left
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-full text-[8px] sm:text-[10px] font-semibold bg-rose-600 text-white shadow-xs">
                        Sold Out
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-2 sm:p-3.5 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Brand & SKU */}
                    <div className="flex items-center justify-between text-[9px] sm:text-[11px] text-slate-400 font-medium">
                      <span className="tracking-wider uppercase text-amber-700 font-bold truncate max-w-[80px] sm:max-w-none">
                        AURUM
                      </span>
                      <span className="font-mono bg-slate-100 px-1 py-0.5 rounded border border-slate-200 text-[8px] sm:text-[10px]">
                        {item.product_code}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 
                      onClick={() => setShowcaseItem(item)}
                      className="font-bold text-xs sm:text-sm text-slate-900 mt-1 line-clamp-1 hover:text-amber-600 cursor-pointer transition-colors"
                      title={item.name}
                    >
                      {item.name}
                    </h3>

                    {/* Rating row */}
                    <div className="flex items-center gap-1 text-[9px] sm:text-[11px] mt-1 text-slate-500">
                      <span className="flex items-center gap-0.5 px-1 py-0.5 bg-emerald-600 text-white rounded font-bold text-[8px] sm:text-[10px]">
                        4.9 <FiStar className="fill-current text-[7px]" />
                      </span>
                      <span className="text-slate-400 text-[8px] sm:text-[10px] truncate">Hallmarked</span>
                    </div>

                    {/* Weight & Specs */}
                    <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] sm:text-xs text-slate-600">
                      <span>Wt: <b>{Number(item.weight).toFixed(1)}g</b></span>
                      <span>₹<b>{Number(item.making_charges).toFixed(0)}/g</b></span>
                    </div>
                  </div>

                  {/* Price Section */}
                  <div className="mt-2 pt-1.5 sm:pt-2 border-t border-slate-100">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <div className="text-xs sm:text-base font-extrabold text-slate-900 leading-tight">
                          ₹{pricing.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                      </div>
                      <span className="text-[8px] sm:text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1 sm:px-1.5 py-0.5 rounded border border-emerald-200">
                        +3% GST
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="mt-2 grid grid-cols-4 gap-1 pt-1.5 border-t border-slate-100">
                      <button
                        onClick={() => setShowcaseItem(item)}
                        className="col-span-2 py-1 px-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] sm:text-xs font-semibold rounded-lg sm:rounded-xl border border-amber-200/80 transition flex items-center justify-center gap-1"
                      >
                        <FiInfo size={11} />
                        <span>View</span>
                      </button>

                      <button
                        onClick={() => handleEdit(item)}
                        title="Edit Item"
                        className="py-1 flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                      >
                        <FiEdit3 size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id, item.name)}
                        title="Delete Item"
                        className="py-1 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      >
                        <FiTrash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TRADITIONAL TABULAR VIEW */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[11px] tracking-wider">
                  <th className="py-3 px-5">Image</th>
                  <th className="py-3 px-5">Code</th>
                  <th className="py-3 px-5">Jewellery Name</th>
                  <th className="py-3 px-5">Metal & Purity</th>
                  <th className="py-3 px-5">Weight</th>
                  <th className="py-3 px-5">Est. Price</th>
                  <th className="py-3 px-5">Stock Status</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const pricing = calculateItemPrice(item);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition group">
                      {/* Image Thumbnail */}
                      <td className="py-2 px-5">
                        <div 
                          onClick={() => setShowcaseItem(item)}
                          className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden cursor-pointer flex items-center justify-center shrink-0"
                        >
                          {item.image_url ? (
                            <img src={getImageUrl(item.image_url)} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <IoDiamondOutline className="text-slate-400 w-5 h-5" />
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-5 font-mono text-[11px] text-slate-600 font-semibold">
                        <span className="bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                          {item.product_code}
                        </span>
                      </td>
                      <td className="py-3 px-5">
                        <div 
                          onClick={() => setShowcaseItem(item)}
                          className="font-semibold text-slate-900 group-hover:text-amber-600 transition-colors cursor-pointer"
                        >
                          {item.name}
                        </div>
                        {item.description && (
                          <div className="text-[11px] text-slate-400 truncate max-w-xs">{item.description}</div>
                        )}
                      </td>
                      <td className="py-3 px-5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          item.metal_type?.toLowerCase() === 'gold'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200/80'
                            : 'bg-slate-100 text-slate-800 border border-slate-300'
                        }`}>
                          <IoDiamondOutline className="text-[10px]" />
                          {item.metal_type?.toLowerCase() === 'silver' ? 'Silver' : `${item.metal_type} ${item.purity}K`}
                        </span>
                      </td>
                      <td className="py-3 px-5 font-medium text-slate-700">
                        {Number(item.weight).toFixed(2)} g
                      </td>
                      <td className="py-3 px-5 font-bold text-slate-900">
                        ₹{pricing.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-3 px-5">
                        {item.stock_quantity > 3 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            {item.stock_quantity} in stock
                          </span>
                        ) : item.stock_quantity > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            Low: {item.stock_quantity} left
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            Out of stock
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setShowcaseItem(item)}
                            title="Flipkart Showcase"
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                          >
                            <FiExternalLink size={15} />
                          </button>
                          <button
                            onClick={() => handleEdit(item)}
                            title="Edit Item"
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                          >
                            <FiEdit3 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id, item.name)}
                            title="Delete Item"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          >
                            <FiTrash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FLIPKART STYLE PRODUCT DETAIL SHOWCASE MODAL */}
      {showcaseItem && (() => {
        const pricing = calculateItemPrice(showcaseItem);
        return (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl sm:rounded-3xl max-w-4xl w-full p-4 sm:p-6 md:p-8 shadow-2xl border border-slate-100 max-h-[94vh] overflow-y-auto relative">
              {/* Close Button */}
              <button
                onClick={() => setShowcaseItem(null)}
                className="absolute top-3 right-3 sm:top-5 sm:right-5 p-1.5 sm:p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition z-10"
              >
                <FiX size={18} className="sm:hidden" />
                <FiX size={20} className="hidden sm:inline" />
              </button>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8">
                {/* Left: Product Showcase Gallery Image */}
                <div className="flex flex-col gap-2 sm:gap-3">
                  <div className="relative aspect-4/3 sm:aspect-square max-h-64 sm:max-h-80 md:max-h-none w-full rounded-xl sm:rounded-2xl bg-slate-100 border border-slate-200/80 overflow-hidden shadow-xs group">
                    {showcaseItem.image_url ? (
                      <img
                        src={getImageUrl(showcaseItem.image_url)}
                        alt={showcaseItem.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 to-slate-100 p-6 text-center">
                        <IoDiamondOutline className="w-12 h-12 text-amber-500/50 mb-1.5" />
                        <span className="text-xs text-slate-400">No Image Uploaded</span>
                      </div>
                    )}

                    {/* Trust Seal Banner */}
                    <div className="absolute bottom-2 left-2 right-2 sm:bottom-3 sm:left-3 sm:right-3 bg-white/95 backdrop-blur py-1.5 px-2.5 sm:py-2 sm:px-3 rounded-lg sm:rounded-xl border border-slate-200 shadow-xs flex items-center justify-between text-[11px] sm:text-xs">
                      <span className="flex items-center gap-1 font-bold text-amber-800">
                        <FiShield className="text-amber-600" size={13} /> 100% Authentic
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-slate-500 font-mono font-semibold">{showcaseItem.product_code}</span>
                    </div>
                  </div>

                  <p className="text-[10px] sm:text-[11px] text-slate-400 text-center">
                    Cloud image hosted on ImageKit CDN
                  </p>
                </div>

                {/* Right: Flipkart E-Commerce Product Information */}
                <div className="flex flex-col justify-between space-y-3 sm:space-y-4">
                  <div>
                    {/* Category & SKU */}
                    <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-700">
                      AURUM JEWELLERS • FINE {showcaseItem.metal_type?.toUpperCase()}
                    </div>

                    <h2 className="text-lg sm:text-xl md:text-2xl font-extrabold text-slate-900 mt-0.5 leading-snug">
                      {showcaseItem.name}
                    </h2>

                    {/* Rating row */}
                    <div className="flex items-center gap-2 mt-1 sm:mt-2">
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-600 text-white rounded font-bold text-[10px] sm:text-xs">
                        4.9 <FiStar className="fill-current text-[8px]" />
                      </span>
                      <span className="text-[11px] sm:text-xs text-slate-500 font-medium">150+ Purchases • BIS Hallmarked</span>
                    </div>

                    {/* Price Block */}
                    <div className="mt-2.5 sm:mt-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-amber-500/5 border border-amber-500/20">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900">
                          ₹{pricing.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                        <span className="text-[10px] sm:text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          Live Rate
                        </span>
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
                        Incl. 24K metal rate (₹{pricing.baseRate}/g), Making fees & 3% GST.
                      </p>
                    </div>

                    {/* Price Breakdown Table */}
                    <div className="mt-2.5 sm:mt-4 space-y-1 sm:space-y-1.5 text-[11px] sm:text-xs text-slate-600 border border-slate-100 rounded-xl p-2.5 sm:p-3 bg-slate-50/50">
                      <div className="flex justify-between">
                        <span>Net Metal Value ({showcaseItem.metal_type?.toLowerCase() === 'silver' ? 'Silver' : `${showcaseItem.purity}K`}):</span>
                        <span className="font-semibold text-slate-900">₹{pricing.goldValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Making Charges (₹{showcaseItem.making_charges}/g):</span>
                        <span className="font-semibold text-slate-900">₹{pricing.totalMaking.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                      </div>
                      {pricing.wastageCharges > 0 && (
                        <div className="flex justify-between">
                          <span>Wastage Allowance ({showcaseItem.wastage_percentage}%):</span>
                          <span className="font-semibold text-slate-900">₹{pricing.wastageCharges.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-1 border-t border-slate-200 font-medium text-amber-900">
                        <span>GST (3%):</span>
                        <span>₹{pricing.gst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                      </div>
                    </div>

                    {/* Specifications Grid */}
                    <div className="mt-2.5 sm:mt-4 pt-2 sm:pt-3 border-t border-slate-100">
                      <h4 className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Specifications</h4>
                      <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
                        <div className="p-1.5 sm:p-2 bg-slate-50 rounded-lg">
                          <span className="text-slate-400 block text-[9px] sm:text-[10px]">Metal & Purity</span>
                          <span className="font-bold text-slate-800">
                            {showcaseItem.metal_type?.toLowerCase() === 'silver' ? 'Silver' : `${showcaseItem.metal_type} ${showcaseItem.purity}K`}
                          </span>
                        </div>
                        <div className="p-1.5 sm:p-2 bg-slate-50 rounded-lg">
                          <span className="text-slate-400 block text-[9px] sm:text-[10px]">Gross Weight</span>
                          <span className="font-bold text-slate-800">{showcaseItem.weight} g</span>
                        </div>
                        <div className="p-1.5 sm:p-2 bg-slate-50 rounded-lg">
                          <span className="text-slate-400 block text-[9px] sm:text-[10px]">Stock Status</span>
                          <span className="font-bold text-emerald-700">{showcaseItem.stock_quantity} available</span>
                        </div>
                        <div className="p-1.5 sm:p-2 bg-slate-50 rounded-lg">
                          <span className="text-slate-400 block text-[9px] sm:text-[10px]">Product Code</span>
                          <span className="font-bold font-mono text-slate-800">{showcaseItem.product_code}</span>
                        </div>
                      </div>
                    </div>

                    {showcaseItem.description && (
                      <div className="mt-2 text-[11px] sm:text-xs text-slate-600">
                        <p>{showcaseItem.description}</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
                    <Link
                      to="/billing"
                      className="w-full sm:flex-1 py-2.5 sm:py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm text-center transition"
                    >
                      + Create Invoice in POS
                    </Link>
                    <button
                      onClick={() => {
                        handleEdit(showcaseItem);
                        setShowcaseItem(null);
                      }}
                      className="w-full sm:w-auto px-4 py-2.5 sm:py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
                    >
                      Edit Details
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ADD / EDIT JEWELLERY MODAL WITH IMAGEKIT CLOUD UPLOADER */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 sm:pb-4 border-b border-slate-100">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                {editingItem ? 'Edit Jewellery Item' : 'Add New Jewellery to Stock'}
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 sm:p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <FiX size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-3 sm:mt-4 space-y-3 sm:space-y-4">
              {/* IMAGEKIT CLOUD IMAGE UPLOAD ZONE */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jewellery Photography (ImageKit Cloud)
                </label>
                
                {formData.image_url ? (
                  <div className="relative aspect-video max-h-48 w-full rounded-xl sm:rounded-2xl bg-slate-100 border-2 border-amber-500/40 overflow-hidden group shadow-xs">
                    <img
                      src={getImageUrl(formData.image_url)}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <label className="cursor-pointer px-3 py-1.5 bg-white text-slate-900 font-semibold text-xs rounded-xl shadow hover:bg-slate-50 transition">
                        Change Image
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                          disabled={uploadingImage}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                        className="px-3 py-1.5 bg-rose-600 text-white font-semibold text-xs rounded-xl shadow hover:bg-rose-700 transition"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-xl sm:rounded-2xl p-4 sm:p-6 cursor-pointer bg-slate-50 hover:bg-amber-50/40 transition group">
                    <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                      {uploadingImage ? (
                        <FiRefreshCw className="animate-spin w-5 h-5 sm:w-6 sm:h-6" />
                      ) : (
                        <FiUploadCloud className="w-5 h-5 sm:w-6 sm:h-6" />
                      )}
                    </div>
                    <span className="text-xs font-bold text-slate-700 text-center">
                      {uploadingImage ? 'Uploading to ImageKit Cloud...' : 'Click or Drag to Upload Photo'}
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 text-center">
                      Saved to ImageKit CDN (PNG, JPG, WEBP)
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploadingImage}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Item Title / Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                  placeholder="e.g. Traditional 22K Gold Bridal Necklace"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Metal Type</label>
                  <select
                    value={formData.metal_type}
                    onChange={(e) => {
                      const selected = e.target.value;
                      setFormData(prev => ({ 
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
                    {formData.metal_type === 'Silver' ? 'Purity' : 'Purity (Karat / %)'}
                  </label>
                  {formData.metal_type === 'Silver' ? (
                    <div className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-medium flex items-center justify-between">
                      <span>Standard Silver</span>
                      <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">Pure</span>
                    </div>
                  ) : (
                    <select
                      value={formData.purity}
                      onChange={(e) => setFormData({ ...formData, purity: Number(e.target.value) })}
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gross Weight (grams) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                    placeholder="12.50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Quantity *</label>
                  <input
                    type="number"
                    required
                    value={formData.stock_quantity}
                    onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                    placeholder="5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Making Charges / g (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.making_charges}
                    onChange={(e) => setFormData({ ...formData, making_charges: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                    placeholder="450"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Wastage %</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.wastage_percentage}
                    onChange={(e) => setFormData({ ...formData, wastage_percentage: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                    placeholder="2.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Hallmark Details</label>
                <textarea
                  rows="2"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none"
                  placeholder="BIS Hallmarked, Antique bridal finish..."
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
                  disabled={submitting || uploadingImage}
                  className="px-5 py-2 text-xs font-semibold bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl shadow-sm hover:from-amber-600 hover:to-amber-700 transition disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingItem ? 'Update Item' : 'Add to Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default Inventory;