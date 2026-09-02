import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { FiSearch, FiPlus, FiEdit, FiTrash2 } from 'react-icons/fi';

const Inventory = () => {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [metalFilter, setMetalFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    fetchItems();
  }, [searchTerm, metalFilter]);

  const fetchItems = async () => {
    try {
      const response = await api.get(`/inventory/?search=${searchTerm}&metal_type=${metalFilter}`);
      setItems(response.data);
    } catch (error) {
      toast.error('Failed to fetch inventory');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (editingItem) {
        await api.put(`/inventory/${editingItem.id}`, formData);
        toast.success('Item updated successfully');
      } else {
        await api.post('/inventory/', formData);
        toast.success('Item added successfully');
      }
      
      setShowAddModal(false);
      setEditingItem(null);
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
      fetchItems();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await api.delete(`/inventory/${id}`);
        toast.success('Item deleted successfully');
        fetchItems();
      } catch (error) {
        toast.error('Failed to delete item');
      }
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      metal_type: item.metal_type,
      purity: item.purity,
      weight: item.weight,
      stock_quantity: item.stock_quantity,
      making_charges: item.making_charges,
      wastage_percentage: item.wastage_percentage,
      description: item.description || '',
      image_url: item.image_url || ''
    });
    setShowAddModal(true);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <button
          onClick={() => {
            setEditingItem(null);
            setShowAddModal(true);
          }}
          className="btn-primary flex items-center"
        >
          <FiPlus className="mr-2" />
          Add Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <FiSearch className="text-gray-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10"
            placeholder="Search by name or product code..."
          />
        </div>
        <select
          value={metalFilter}
          onChange={(e) => setMetalFilter(e.target.value)}
          className="input-field w-40"
        >
          <option value="">All Metals</option>
          <option value="Gold">Gold</option>
          <option value="Silver">Silver</option>
        </select>
      </div>

      {/* Inventory table */}
      <div className="table-container">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-header">Product Code</th>
              <th className="table-header">Name</th>
              <th className="table-header">Metal</th>
              <th className="table-header">Purity</th>
              <th className="table-header">Weight (g)</th>
              <th className="table-header">Stock</th>
              <th className="table-header">Making Charges</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="table-cell font-mono text-sm">{item.product_code}</td>
                <td className="table-cell font-medium">{item.name}</td>
                <td className="table-cell">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    item.metal_type === 'Gold' 
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {item.metal_type}
                  </span>
                </td>
                <td className="table-cell">{item.purity}K</td>
                <td className="table-cell">{item.weight}</td>
                <td className="table-cell">
                  <span className={`font-medium ${
                    item.stock_quantity < 5 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {item.stock_quantity}
                  </span>
                </td>
                <td className="table-cell">₹{item.making_charges}/g</td>
                <td className="table-cell">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(item)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <FiEdit />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full my-8">
            <h2 className="text-xl font-bold mb-4">
              {editingItem ? 'Edit Item' : 'Add New Item'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Metal Type *</label>
                  <select
                    value={formData.metal_type}
                    onChange={(e) => setFormData({ ...formData, metal_type: e.target.value })}
                    className="input-field"
                    required
                  >
                    <option value="Gold">Gold</option>
                    <option value="Silver">Silver</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Purity (K) *</label>
                  <select
                    value={formData.purity}
                    onChange={(e) => setFormData({ ...formData, purity: parseFloat(e.target.value) })}
                    className="input-field"
                    required
                  >
                    <option value="24">24K</option>
                    <option value="22">22K</option>
                    <option value="18">18K</option>
                    <option value="14">14K</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Weight (g) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Stock Quantity *</label>
                  <input
                    type="number"
                    value={formData.stock_quantity}
                    onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Making Charges (₹/g) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.making_charges}
                    onChange={(e) => setFormData({ ...formData, making_charges: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Wastage (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.wastage_percentage}
                    onChange={(e) => setFormData({ ...formData, wastage_percentage: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input-field"
                  rows="3"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Image URL</label>
                <input
                  type="url"
                  value={formData.image_url}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  className="input-field"
                  placeholder="https://example.com/image.jpg"
                />
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingItem(null);
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary"
                >
                  {loading ? 'Saving...' : editingItem ? 'Update Item' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;