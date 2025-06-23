import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { Toaster } from 'react-hot-toast';

// Add token verification caching
const TokenCache = {
  tokenStatus: null,
  lastVerified: null,
  TTL: 30 * 60 * 1000, // 30 minutes

  isValid() {
    if (!this.tokenStatus || !this.lastVerified) {
      return false;
    }
    return (Date.now() - this.lastVerified) < this.TTL;
  },

  setStatus(status) {
    this.tokenStatus = status;
    this.lastVerified = Date.now();
  }
};

// Patch the global fetch to cache token verification responses
const originalFetch = window.fetch;
window.fetch = async function(url, options) {
  // If this is a token verification request and we have a cached result
  if (url.includes('/debug_token') && TokenCache.isValid()) {
    console.log('Using cached token verification');
    return new Response(JSON.stringify({ data: TokenCache.tokenStatus }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Otherwise proceed with the original fetch
  const response = await originalFetch(url, options);
  
  // Cache token verification responses
  if (url.includes('/debug_token') && response.ok) {
    try {
      // Clone the response to avoid reading it twice
      const clone = response.clone();
      const data = await clone.json();
      TokenCache.setStatus(data.data);
    } catch (error) {
      console.error('Error caching token status:', error);
    }
  }
  
  return response;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
    <Toaster position="top-right" />
  </React.StrictMode>
);