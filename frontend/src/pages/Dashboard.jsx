import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { 
  FiUsers, 
  FiBox, 
  FiFileText, 
  FiDollarSign,
  FiTrendingUp,
  FiClock
} from 'react-icons/fi';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalItems: 0,
    totalBills: 0,
    todayRevenue: 0,
    recentBills: [],
    goldRate: null
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [customersRes, inventoryRes, billsRes, goldRateRes] = await Promise.allSettled([
        api.get('/customers/'),
        api.get('/inventory/'),
        api.get('/billing/?limit=5'),
        api.get('/gold-rate/')
      ]);

      const customers = customersRes.status === 'fulfilled' && Array.isArray(customersRes.value?.data)
        ? customersRes.value.data
        : [];
      const inventory = inventoryRes.status === 'fulfilled' && Array.isArray(inventoryRes.value?.data)
        ? inventoryRes.value.data
        : [];
      const bills = billsRes.status === 'fulfilled' && Array.isArray(billsRes.value?.data)
        ? billsRes.value.data
        : [];
      const goldRate = goldRateRes.status === 'fulfilled' && goldRateRes.value?.data
        ? goldRateRes.value.data
        : null;

      const revenue = bills.reduce((sum, bill) => sum + (Number(bill.total_amount) || 0), 0);

      setStats({
        totalCustomers: customers.length,
        totalItems: inventory.length,
        totalBills: bills.length,
        todayRevenue: revenue,
        recentBills: bills.slice(0, 5),
        goldRate
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    { 
      title: 'Add Customer', 
      icon: FiUsers, 
      path: '/customers',
      color: 'bg-blue-500'
    },
    { 
      title: 'Add Item', 
      icon: FiBox, 
      path: '/inventory',
      color: 'bg-green-500'
    },
    { 
      title: 'New Bill', 
      icon: FiFileText, 
      path: '/billing',
      color: 'bg-purple-500'
    },
    { 
      title: 'Update Rate', 
      icon: FiTrendingUp, 
      path: '/gold-rate',
      color: 'bg-yellow-500'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <div className="flex items-center text-sm text-gray-500 bg-white px-3 py-1.5 rounded-lg shadow-sm border">
          <FiClock className="mr-2 text-blue-600" />
          <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="card hover:shadow-lg transition-all duration-200 border border-gray-100">
          <div className="flex items-center">
            <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl">
              <FiUsers size={26} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Customers</p>
              <p className="text-2xl font-bold text-gray-800">{stats.totalCustomers}</p>
            </div>
          </div>
        </div>

        <div className="card hover:shadow-lg transition-all duration-200 border border-gray-100">
          <div className="flex items-center">
            <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <FiBox size={26} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Inventory Items</p>
              <p className="text-2xl font-bold text-gray-800">{stats.totalItems}</p>
            </div>
          </div>
        </div>

        <div className="card hover:shadow-lg transition-all duration-200 border border-gray-100">
          <div className="flex items-center">
            <div className="p-3.5 bg-purple-50 text-purple-600 rounded-xl">
              <FiFileText size={26} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Invoices</p>
              <p className="text-2xl font-bold text-gray-800">{stats.totalBills}</p>
            </div>
          </div>
        </div>

        <div className="card hover:shadow-lg transition-all duration-200 border border-gray-100">
          <div className="flex items-center">
            <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl">
              <FiDollarSign size={26} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-800">₹{(stats.todayRevenue || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Current Gold & Silver Rate */}
      {stats.goldRate && (
        <div className="card bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-amber-900 flex items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-2 animate-pulse"></span>
              Today's Live Precious Metal Rates
            </h2>
            <Link to="/gold-rate" className="text-sm font-medium text-amber-700 hover:text-amber-800 underline">
              Update Rates
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/80 p-3.5 rounded-lg border border-amber-200/50 shadow-sm">
              <p className="text-xs font-semibold uppercase text-amber-700">Gold 24K (Pure)</p>
              <p className="text-xl font-black text-gray-900 mt-1">₹{stats.goldRate.gold_rate_24k}/g</p>
            </div>
            <div className="bg-white/80 p-3.5 rounded-lg border border-amber-200/50 shadow-sm">
              <p className="text-xs font-semibold uppercase text-amber-700">Gold 22K (Standard)</p>
              <p className="text-xl font-black text-gray-900 mt-1">₹{stats.goldRate.gold_rate_22k}/g</p>
            </div>
            <div className="bg-white/80 p-3.5 rounded-lg border border-amber-200/50 shadow-sm">
              <p className="text-xs font-semibold uppercase text-amber-700">Gold 18K</p>
              <p className="text-xl font-black text-gray-900 mt-1">₹{stats.goldRate.gold_rate_18k}/g</p>
            </div>
            <div className="bg-white/80 p-3.5 rounded-lg border border-amber-200/50 shadow-sm">
              <p className="text-xs font-semibold uppercase text-gray-600">Silver</p>
              <p className="text-xl font-black text-gray-900 mt-1">₹{stats.goldRate.silver_rate}/g</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              to={action.path}
              className="card hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-gray-100 flex items-center p-4 group"
            >
              <div className={`p-3 rounded-xl text-white ${action.color} group-hover:scale-110 transition-transform duration-200 shadow-sm`}>
                <action.icon size={22} />
              </div>
              <span className="ml-3 font-semibold text-gray-800">{action.title}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Bills Table */}
      <div className="card border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">Recent Invoices</h2>
          <Link to="/billing" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Create Invoice &rarr;
          </Link>
        </div>
        <div className="table-container">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Invoice #</th>
                <th className="table-header">Customer</th>
                <th className="table-header">Date</th>
                <th className="table-header">Amount</th>
                <th className="table-header">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.recentBills && stats.recentBills.length > 0 ? (
                stats.recentBills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell font-semibold text-blue-600">{bill.invoice_number}</td>
                    <td className="table-cell">{bill.customer_name || 'Walk-in Customer'}</td>
                    <td className="table-cell text-gray-500">
                      {bill.bill_date ? new Date(bill.bill_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="table-cell font-bold text-gray-900">₹{(bill.total_amount || 0).toLocaleString()}</td>
                    <td className="table-cell">
                      <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                        bill.payment_status === 'paid' 
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {bill.payment_status || 'paid'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-500">
                    No recent invoices found. Click "New Bill" to generate your first invoice.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;