import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

// In-memory cache store
const memoryCache = new Map();
const cacheListeners = new Map();

/**
 * Get cached data by key
 */
export const getCachedData = (key) => {
  const item = memoryCache.get(key);
  if (!item) return null;
  return item.data;
};

/**
 * Set cache entry and notify listeners
 */
export const setCachedData = (key, data) => {
  memoryCache.set(key, {
    data,
    timestamp: Date.now(),
  });

  const listeners = cacheListeners.get(key);
  if (listeners) {
    listeners.forEach((callback) => callback(data));
  }
};

/**
 * Invalidate specific cache key or keys matching prefix
 */
export const invalidateCache = (pattern) => {
  if (!pattern) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.includes(pattern)) {
      memoryCache.delete(key);
    }
  }
};

/**
 * React hook implementing Stale-While-Revalidate (SWR) caching pattern.
 * If data exists in memory, returns immediately (0ms delay).
 * Quietly revalidates in the background so UI stays fresh.
 */
export const useCachedApi = (url, options = {}) => {
  const { enabled = true, ttl = 60000, initialData = null } = options;

  const cached = url ? memoryCache.get(url) : null;
  const initialValue = cached ? cached.data : initialData;

  const [data, setData] = useState(() => initialValue);
  const [loading, setLoading] = useState(() => !cached && enabled && Boolean(url));
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);
  const currentUrlRef = useRef(url);
  currentUrlRef.current = url;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch function that does NOT depend on data to avoid infinite re-render loops
  const fetchData = useCallback(
    async (isBackground = false) => {
      const targetUrl = currentUrlRef.current;
      if (!targetUrl || !enabled) return;

      if (isBackground) {
        setIsValidating(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await api.get(targetUrl);
        if (mountedRef.current && currentUrlRef.current === targetUrl) {
          setData(response.data);
          setCachedData(targetUrl, response.data);
          setError(null);
        }
      } catch (err) {
        if (mountedRef.current && currentUrlRef.current === targetUrl) {
          console.error(`API Error on ${targetUrl}:`, err);
          setError(err);
        }
      } finally {
        if (mountedRef.current && currentUrlRef.current === targetUrl) {
          setLoading(false);
          setIsValidating(false);
        }
      }
    },
    [enabled]
  );

  useEffect(() => {
    if (!url || !enabled) {
      setLoading(false);
      return;
    }

    // Subscribe to external cache invalidations/updates
    if (!cacheListeners.has(url)) {
      cacheListeners.set(url, new Set());
    }
    const listener = (newData) => {
      if (mountedRef.current) setData(newData);
    };
    cacheListeners.get(url).add(listener);

    const existing = memoryCache.get(url);
    if (existing) {
      setData(existing.data);
      setLoading(false);
      // If cached data is older than TTL, revalidate silently in background
      if (Date.now() - existing.timestamp > ttl) {
        fetchData(true);
      }
    } else {
      // Not in cache, do initial fetch
      fetchData(false);
    }

    return () => {
      cacheListeners.get(url)?.delete(listener);
    };
  }, [url, enabled, ttl, fetchData]);

  return {
    data: data !== null ? data : initialData,
    loading,
    isValidating,
    error,
    refetch: () => fetchData(false),
    mutate: (newData) => {
      setData(newData);
      if (url) setCachedData(url, newData);
    },
  };
};
