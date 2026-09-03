import React, { createContext, useState, useContext, useEffect } from 'react';
import api, { API_BASE_URL } from '../services/api';
import { invalidateCache } from '../utils/cache';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('token');
    return token ? { token } : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setUser({ token });
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    try {
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);
      
      const response = await api.post('/login', formData);
      const { access_token } = response.data;
      
      localStorage.setItem('token', access_token);
      api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      setUser({ token: access_token });
      
      return { success: true };
    } catch (error) {
      const detail = error.response?.data?.detail;
      let errorMsg = detail;
      if (!error.response) {
        errorMsg = `Cannot reach backend (${API_BASE_URL}). Check your VITE_API_URL in Vercel settings and make sure your Render service is active.`;
      } else if (error.response.status === 404) {
        errorMsg = `Endpoint /login not found on ${API_BASE_URL}. Please check your backend URL in Vercel settings.`;
      } else if (!detail) {
        errorMsg = 'Login failed. Please check your credentials.';
      }
      return { 
        success: false, 
        error: errorMsg 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete api.defaults.headers.common['Authorization'];
    invalidateCache(); // Clear in-memory client cache
    setUser(null);
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  };

  const value = {
    user,
    login,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};