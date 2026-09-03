import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useCachedApi, invalidateCache } from '../utils/cache';
import { FiSave, FiRefreshCw, FiTrendingUp, FiCheckCircle } from 'react-icons/fi';
import { IoDiamondOutline } from 'react-icons/io5';

const GoldRate = () => {
  const { data: currentRates, loading, isValidating, refetch } = useCachedApi('/gold-rate/', { ttl: 60000 });
  const [submitting, setSubmitting] = useState(false);

  const [rates, setRates] = useState({
    gold_rate_24k: '',
    gold_rate_22k: '',
    gold_rate_18k: '',
    silver_rate: ''
  });

  useEffect(() => {
    if (currentRates) {
      setRates({
        gold_rate_24k: currentRates.gold_rate_24k || '',
        gold_rate_22k: currentRates.gold_rate_22k || '',
        gold_rate_18k: currentRates.gold_rate_18k || '',
        silver_rate: currentRates.silver_rate || ''
      });
    }
  }, [currentRates]);

  // Quick auto-calculate purity ratios from 24K base
  const handleBaseRateChange = (val24k) => {
    const num = parseFloat(val24k);
    if (!isNaN(num) && num > 0) {
      setRates({
        gold_rate_24k: val24k,
        gold_rate_22k: Math.round((num * 22) / 24).toString(),
        gold_rate_18k: Math.round((num * 18) / 24).toString(),
        silver_rate: rates.silver_rate
      });
    } else {
      setRates(prev => ({ ...prev, gold_rate_24k: val24k }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      await api.post('/gold-rate/', {
        gold_rate_24k: parseFloat(rates.gold_rate_24k),
        gold_rate_22k: parseFloat(rates.gold_rate_22k),
        gold_rate_18k: parseFloat(rates.gold_rate_18k),
        silver_rate: parseFloat(rates.silver_rate)
      });
      
      toast.success('Metal rates updated and synchronized across all terminals');
      invalidateCache('/gold-rate');
      invalidateCache('/dashboard');
      refetch();
    } catch (error) {
      toast.error('Failed to update rates');
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
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Precious Metal Rate Center</h1>
            {isValidating && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                <FiRefreshCw className="animate-spin text-[10px]" /> Live
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Define daily store benchmarks for Gold 24K, 22K, 18K and Silver (999)</p>
        </div>

        <button
          onClick={() => refetch()}
          title="Refresh rates"
          className="p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition border border-slate-200"
        >
          <FiRefreshCw size={15} className={isValidating ? 'animate-spin text-amber-600' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FiTrendingUp className="text-amber-600" />
              Update Metal Rates
            </h2>
            <span className="text-[11px] text-slate-400">Values per gram (₹)</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-700">Gold 24K (Pure 999) *</label>
                <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Auto-fills 22K & 18K</span>
              </div>
              <input
                type="number"
                step="0.01"
                required
                value={rates.gold_rate_24k}
                onChange={(e) => handleBaseRateChange(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none font-semibold text-slate-800"
                placeholder="e.g. 7250"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Gold 22K (Hallmark 916) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={rates.gold_rate_22k}
                  onChange={(e) => setRates({ ...rates, gold_rate_22k: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 outline-none font-semibold text-slate-800"
                  placeholder="e.g. 6650"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Gold 18K (750) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={rates.gold_rate_18k}
                  onChange={(e) => setRates({ ...rates, gold_rate_18k: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 outline-none font-semibold text-slate-800"
                  placeholder="e.g. 5450"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Silver Rate (₹ / gram) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={rates.silver_rate}
                onChange={(e) => setRates({ ...rates, silver_rate: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/30 outline-none font-semibold text-slate-800"
                placeholder="e.g. 89"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
            >
              <FiSave size={16} />
              <span>{submitting ? 'Updating System...' : 'Save & Publish Rates'}</span>
            </button>
          </form>
        </div>

        {/* Current Rates Preview */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <IoDiamondOutline className="text-amber-600" />
              Active System Rates
            </h2>
            {currentRates?.updated_at && (
              <span className="text-[11px] text-slate-400">
                Last updated: {new Date(currentRates.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {currentRates ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-300/80">
                  <span className="text-xs font-semibold text-amber-900 block">Gold 24K</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    ₹{currentRates.gold_rate_24k?.toLocaleString('en-IN')}
                    <span className="text-xs font-normal text-slate-500">/g</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-medium">99.9% Purity</span>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-300/80">
                  <span className="text-xs font-semibold text-amber-900 block">Gold 22K</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    ₹{currentRates.gold_rate_22k?.toLocaleString('en-IN')}
                    <span className="text-xs font-normal text-slate-500">/g</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-medium">91.6% Hallmark</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-xs font-semibold text-slate-700 block">Gold 18K</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    ₹{currentRates.gold_rate_18k?.toLocaleString('en-IN')}
                    <span className="text-xs font-normal text-slate-500">/g</span>
                  </div>
                  <span className="text-[10px] text-slate-500">75.0% Jewellery</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-xs font-semibold text-slate-700 block">Silver (999)</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    ₹{currentRates.silver_rate?.toLocaleString('en-IN')}
                    <span className="text-xs font-normal text-slate-500">/g</span>
                  </div>
                  <span className="text-[10px] text-slate-500">Fine Silver</span>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 space-y-1">
                <p>• Changes immediately apply to new bills generated in Point of Sale.</p>
                <p>• Historical bills retain their locked transaction rates.</p>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">Loading active rates...</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GoldRate;