import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { FiSearch, FiPlus, FiTrash2, FiPrinter } from 'react-icons/fi';

const Billing = () => {
  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showItemSearch, setShowItemSearch] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const response = await api.get('/inventory/');
      setInventory(response.data);
    } catch (error) {
      toast.error('Failed to fetch inventory');
    }
  };

  const searchCustomers = async () => {
    try {
      const response = await api.get(`/customers/?search=${customerSearch}`);
      setCustomers(response.data);
      setShowCustomerSearch(true);
    } catch (error) {
      toast.error('Failed to search customers');
    }
  };

  const searchItems = async () => {
    try {
      const response = await api.get(`/inventory/?search=${itemSearch}`);
      setInventory(response.data);
      setShowItemSearch(true);
    } catch (error) {
      toast.error('Failed to search items');
    }
  };

  const addItem = (item) => {
    const existing = selectedItems.find(i => i.jewellery_id === item.id);
    if (existing) {
      toast.error('Item already added');
      return;
    }
    
    if (item.stock_quantity < 1) {
      toast.error('Insufficient stock');
      return;
    }
    
    setSelectedItems([...selectedItems, {
      jewellery_id: item.id,
      quantity: 1,
      item_details: item
    }]);
    setShowItemSearch(false);
    setItemSearch('');
  };

  const removeItem = (index) => {
    const newItems = [...selectedItems];
    newItems.splice(index, 1);
    setSelectedItems(newItems);
  };

  const calculateTotal = () => {
    let total = 0;
    selectedItems.forEach(item => {
      // This is an estimate - actual calculation happens on backend
      const weight = item.item_details.weight;
      const purity = item.item_details.purity;
      const rate = item.item_details.metal_type === 'Gold' ? 5000 : 70; // Example rates
      const makingCharges = item.item_details.making_charges;
      const goldValue = weight * rate * (purity / 24);
      const totalMaking = weight * makingCharges;
      const subtotal = goldValue + totalMaking;
      const gst = subtotal * 0.03;
      total += (subtotal + gst) * item.quantity;
    });
    return total;
  };

  const handleCreateBill = async () => {
    if (!selectedCustomer) {
      toast.error('Please select a customer');
      return;
    }
    
    if (selectedItems.length === 0) {
      toast.error('Please add items to bill');
      return;
    }
    
    setLoading(true);
    
    try {
      const billData = {
        customer_id: selectedCustomer.id,
        items: selectedItems.map(item => ({
          jewellery_id: item.jewellery_id,
          quantity: item.quantity
        })),
        payment_method: paymentMethod,
        notes: notes
      };
      
      const response = await api.post('/billing/', billData);
      
      toast.success('Bill created successfully');
      
      // Download PDF
      const pdfResponse = await api.get(`/billing/${response.data.id}/pdf`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([pdfResponse.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${response.data.invoice_number}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      // Reset form
      setSelectedCustomer(null);
      setSelectedItems([]);
      setNotes('');
      setPaymentMethod('cash');
      fetchInventory();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create bill');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Create Bill</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left side - Customer and Items */}
        <div className="space-y-6">
          {/* Customer Selection */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Customer</h2>
            
            {selectedCustomer ? (
              <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
                <div>
                  <p className="font-medium">{selectedCustomer.name}</p>
                  <p className="text-sm text-gray-600">{selectedCustomer.phone}</p>
                  <p className="text-sm text-gray-600">{selectedCustomer.customer_id}</p>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-red-600 hover:text-red-800"
                >
                  <FiTrash2 />
                </button>
              </div>
            ) : (
              <div>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="input-field"
                    placeholder="Search customer..."
                  />
                  <button onClick={searchCustomers} className="btn-secondary">
                    Search
                  </button>
                </div>
                
                {showCustomerSearch && (
                  <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                    {customers.map(customer => (
                      <button
                        key={customer.id}
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setShowCustomerSearch(false);
                        }}
                        className="w-full text-left p-3 hover:bg-gray-50 rounded-lg"
                      >
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-sm text-gray-600">{customer.phone}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Items Selection */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Items</h2>
            
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                className="input-field"
                placeholder="Search item..."
              />
              <button onClick={searchItems} className="btn-secondary">
                Search
              </button>
            </div>
            
            {showItemSearch && (
              <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                {inventory.map(item => (
                  <button
                    key={item.id}
                    onClick={() => addItem(item)}
                    className="w-full text-left p-3 hover:bg-gray-50 rounded-lg"
                  >
                    <div className="flex justify-between">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-gray-600">
                          {item.metal_type} | {item.purity}K | {item.weight}g
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Stock: {item.stock_quantity}</p>
                        <p className="text-sm font-medium">₹{item.making_charges}/g</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right side - Bill Summary */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Bill Summary</h2>
          
          {/* Selected Items */}
          <div className="space-y-3 mb-4">
            {selectedItems.map((item, index) => (
              <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{item.item_details.name}</p>
                  <p className="text-sm text-gray-600">
                    {item.item_details.metal_type} | {item.item_details.purity}K | {item.item_details.weight}g
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max={item.item_details.stock_quantity}
                    value={item.quantity}
                    onChange={(e) => {
                      const newItems = [...selectedItems];
                      newItems[index].quantity = parseInt(e.target.value) || 1;
                      setSelectedItems(newItems);
                    }}
                    className="input-field w-20"
                  />
                  <button
                    onClick={() => removeItem(index)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Payment Details */}
          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="input-field"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input-field"
                rows="3"
                placeholder="Additional notes..."
              />
            </div>
          </div>

          {/* Total */}
          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-lg font-medium">Estimated Total</span>
              <span className="text-2xl font-bold">
                ₹{calculateTotal().toLocaleString()}
              </span>
            </div>
            
            <button
              onClick={handleCreateBill}
              disabled={loading || !selectedCustomer || selectedItems.length === 0}
              className="btn-primary w-full py-3 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating Bill...' : 'Generate Bill & Print'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Billing;