import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { FiSearch, FiPrinter, FiDownload } from 'react-icons/fi';

const CustomerHistory = () => {
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [bills, setBills] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const customerId = searchParams.get('customer_id');
    if (customerId) {
      fetchCustomerBills(customerId);
    }
  }, [searchParams]);

  const searchCustomers = async () => {
    try {
      const response = await api.get(`/customers/?search=${searchTerm}`);
      setCustomers(response.data);
    } catch (error) {
      toast.error('Failed to search customers');
    }
  };

  const fetchCustomerBills = async (customerId) => {
    setLoading(true);
    try {
      const [customerResponse, billsResponse] = await Promise.all([
        api.get(`/customers/${customerId}`),
        api.get(`/customers/${customerId}/bills`)
      ]);
      
      setSelectedCustomer(customerResponse.data);
      setBills(billsResponse.data);
    } catch (error) {
      toast.error('Failed to fetch customer history');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintInvoice = async (billId) => {
    try {
      const response = await api.get(`/billing/${billId}/pdf`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoice-${billId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error('Failed to download invoice');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Customer Purchase History</h1>
      
      {/* Customer Search */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Search Customer</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field"
            placeholder="Search by name, phone, or ID..."
          />
          <button onClick={searchCustomers} className="btn-primary">
            <FiSearch className="mr-2" />
            Search
          </button>
        </div>
        
        {customers.length > 0 && !selectedCustomer && (
          <div className="mt-4 space-y-2">
            {customers.map(customer => (
              <button
                key={customer.id}
                onClick={() => fetchCustomerBills(customer.id)}
                className="w-full text-left p-3 hover:bg-gray-50 rounded-lg"
              >
                <p className="font-medium">{customer.name}</p>
                <p className="text-sm text-gray-600">
                  {customer.phone} | {customer.customer_id}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Customer Info */}
      {selectedCustomer && (
        <div className="card mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold">{selectedCustomer.name}</h2>
              <p className="text-gray-600">{selectedCustomer.phone}</p>
              <p className="text-gray-600">{selectedCustomer.customer_id}</p>
              {selectedCustomer.address && (
                <p className="text-gray-600">{selectedCustomer.address}</p>
              )}
            </div>
            <button
              onClick={() => {
                setSelectedCustomer(null);
                setBills([]);
              }}
              className="btn-secondary"
            >
              Change Customer
            </button>
          </div>
        </div>
      )}

      {/* Bills Table */}
      {selectedCustomer && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Purchase History</h2>
          
          {loading ? (
            <p className="text-center py-8">Loading...</p>
          ) : bills.length > 0 ? (
            <div className="table-container">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-header">Invoice #</th>
                    <th className="table-header">Date</th>
                    <th className="table-header">Items</th>
                    <th className="table-header">Total Amount</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {bills.map(bill => (
                    <tr key={bill.id}>
                      <td className="table-cell font-mono text-sm">
                        {bill.invoice_number}
                      </td>
                      <td className="table-cell">
                        {new Date(bill.bill_date).toLocaleDateString()}
                      </td>
                      <td className="table-cell">
                        {bill.items.length} items
                      </td>
                      <td className="table-cell font-medium">
                        ₹{bill.total_amount.toLocaleString()}
                      </td>
                      <td className="table-cell">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          bill.payment_status === 'paid' 
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {bill.payment_status}
                        </span>
                      </td>
                      <td className="table-cell">
                        <button
                          onClick={() => handlePrintInvoice(bill.id)}
                          className="text-blue-600 hover:text-blue-800 flex items-center"
                        >
                          <FiPrinter className="mr-1" />
                          Reprint
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-8 text-gray-600">
              No bills found for this customer.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerHistory;