import axios from 'axios';
import authService from './auth';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Request interceptor to add session ID
apiClient.interceptors.request.use(
  (config) => {
    const sessionId = authService.getSessionId();
    if (sessionId) {
      // Add session_id as query parameter for all requests
      config.params = {
        ...config.params,
        session_id: sessionId
      };
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle authentication errors
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail;
      
      if (status === 401) {
        // Session expired or invalid
        if (detail && detail.includes('session')) {
          authService.clearSession();
          // Redirect to login if not already there
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
      } else if (status === 500) {
        console.error('Server error:', detail);
      }
    } else if (error.request) {
      console.error('Network error:', error.message);
    } else {
      console.error('Request error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

// API functions
export const authAPI = {
  login: (credentials) => 
    apiClient.post('/auth/login', credentials),
  
  register: (userData) => 
    apiClient.post('/auth/register', userData),
  
  verifySession: (sessionId) => 
    apiClient.get('/auth/verify', { params: { session_id: sessionId } }),
  
  logout: (sessionId) => 
    apiClient.post('/auth/logout', {}, { params: { session_id: sessionId } })
};

export const dashboardAPI = {
  getDashboardData: () => 
    apiClient.get('/api/dashboard'),
  
  getScheduledPosts: () => 
    apiClient.get('/api/scheduled-posts'),
  
  getAIContent: () => 
    apiClient.get('/api/ai-content')
};

export const analyticsAPI = {
  getAnalytics: (platform = 'all', period = '30d') => 
    apiClient.get('/api/analytics', { params: { platform, period } }),
  
  getEngagement: (platform = 'all', period = '30d') => 
    apiClient.get('/api/analytics/engagement', { params: { platform, period } }),
  
  getReach: (platform = 'all', period = '30d') => 
    apiClient.get('/api/analytics/reach', { params: { platform, period } }),
  
  getSummary: (period = '30d') => 
    apiClient.get('/api/analytics/summary', { params: { period } })
};

export const postsAPI = {
  getPosts: () => 
    apiClient.get('/api/posts'),
  
  createPost: (postData) => 
    apiClient.post('/api/posts', postData),
  
  updatePost: (postId, postData) => 
    apiClient.put(`/api/posts/${postId}`, postData),
  
  deletePost: (postId) => 
    apiClient.delete(`/api/posts/${postId}`),
  
  getPostHistory: (postId) => 
    apiClient.get(`/api/posts/${postId}/history`)
};

export default apiClient;