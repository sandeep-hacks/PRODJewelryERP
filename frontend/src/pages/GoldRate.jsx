import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { FiSave, FiRefreshCw } from 'react-icons/fi';

const GoldRate = () => {
  const [rates, setRates] = useState({
    gold_rate_24k: '',
    gold_rate_22k: '',
    gold_rate_18k: '',
    silver_rate: ''
  });
  const [loading, setLoading] = useState(false);
  const [currentRates, setCurrentRates] = useState(null);

  useEffect(() => {
    fetchCurrentRates();
  }, []);

  const fetchCurrentRates = async () => {
    try {
      const response = await api.get('/gold-rate/');
      if (response.data) {
        setCurrentRates(response.data);
        setRates({
          gold_rate_24k: response.data.gold_rate_24k,
          gold_rate_22k: response.data.gold_rate_22k,
          gold_rate_18k: response.data.gold_rate_18k,
          silver_rate: response.data.silver_rate
        });
      }
    } catch (error) {
      console.error('Failed to fetch current rates');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await api.post('/gold-rate/', {
        gold_rate_24k: parseFloat(rates.gold_rate_24k),
        gold_rate_22k: parseFloat(rates.gold_rate_22k),
        gold_rate_18k: parseFloat(rates.gold_rate_18k),
        silver_rate: parseFloat(rates.silver_rate)
      });
      
      toast.success('Gold rates updated successfully');
      fetchCurrentRates();
    } catch (error) {
      toast.error('Failed to update rates');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Gold Rate Management</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Update Form */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Update Today's Rates</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Gold Rate 24K (₹/gram)
              </label>
              <input
                type="number"
                step="0.01"
                value={rates.gold_rate_24k}
                onChange={(e) => setRates({ ...rates, gold_rate_24k: e.target.value })}
                className="input-field"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">
                Gold Rate 22K (₹/gram)
              </label>
              <input
                type="number"
                step="0.01"
                value={rates.gold_rate_22k}
                onChange={(e) => setRates({ ...rates, gold_rate_22k: e.target.value })}
                className="input-field"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">
                Gold Rate 18K (₹/gram)
              </label>
              <input
                type="number"
                step="0.01"
                value={rates.gold_rate_18k}
                onChange={(e) => setRates({ ...rates, gold_rate_18k: e.target.value })}
                className="input-field"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">
                Silver Rate (₹/gram)
              </label>
              <input
                type="number"
                step="0.01"
                value={rates.silver_rate}
                onChange={(e) => setRates({ ...rates, silver_rate: e.target.value })}
                className="input-field"
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3"
            >
              {loading ? 'Updating...' : 'Update Rates'}
            </button>
          </form>
        </div>
        
        {/* Current Rates Display */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Current Rates</h2>
          
          {currentRates ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-gray-600">Gold 24K</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    ₹{currentRates.gold_rate_24k}/g
                  </p>
                </div>
                
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-gray-600">Gold 22K</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    ₹{currentRates.gold_rate_22k}/g
                  </p>
                </div>
                
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-gray-600">Gold 18K</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    ₹{currentRates.gold_rate_18k}/g
                  </p>
                </div>
                
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Silver</p>
                  <p className="text-2xl font-bold text-gray-600">
                    ₹{currentRates.silver_rate}/g
                  </p>
                </div>
              </div>
              
              <div className="text-sm text-gray-600">
                <p>Last Updated: {new Date(currentRates.updated_at).toLocaleString()}</p>
                <p>Updated By: {currentRates.updated_by}</p>
              </div>
              
              <button
                onClick={fetchCurrentRates}
                className="btn-secondary flex items-center"
              >
                <FiRefreshCw className="mr-2" />
                Refresh Rates
              </button>
            </div>
          ) : (
            <p className="text-gray-600">No rates set yet. Please update today's rates.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default GoldRate;