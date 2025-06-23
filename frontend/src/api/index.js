// Use relative URLs since we have a proxy set up in package.json
const API_BASE_URL = '';

class ApiClient {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      console.log(`Making API request to: ${url}`);
      const response = await fetch(url, config);

      // Check if response is empty (204 No Content)
      if (response.status === 204) {
        return { success: true };
      }

      let data = {};
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (e) {
          console.warn('Invalid JSON response:', url, e);
        }
      } else {
        try {
          // For non-JSON responses, get text
          const text = await response.text();
          data = { message: text };
        } catch (e) {
          console.warn('Empty response:', url);
        }
      }

      if (!response.ok) {
        throw new Error(data.detail || data.message || data.error || 'API request failed');
      }

      // Handle various response formats
      if (data.success === false && data.error) {
        throw new Error(data.error);
      }

      return data;
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  // Auth methods
  async login(credentials) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async logout() {
    return this.request('/api/auth/logout', {
      method: 'POST',
    });
  }

  // Posts methods
  async getPosts() {
    const response = await this.request('/api/posts');
    console.log('Raw API response for posts:', response);
    
    // Handle various response formats
    if (Array.isArray(response)) {
      return { posts: response, total: response.length, timestamp: new Date().toISOString() };
    } else if (response.posts) {
      return response;
    } else if (response.data && Array.isArray(response.data)) {
      return { posts: response.data, total: response.data.length, timestamp: response.timestamp || new Date().toISOString() };
    }
    
    // Default empty response
    return { posts: [], total: 0, timestamp: new Date().toISOString() };
  }

  async getScheduledPosts() {
    const response = await this.getPosts();
    
    // Filter for scheduled posts if needed
    const scheduledPosts = response.posts?.filter(post => post.status === 'scheduled') || [];
    
    return { 
      posts: scheduledPosts, 
      total: scheduledPosts.length,
      timestamp: response.timestamp 
    };
  }

  async createPost(postData) {
    const sessionId = localStorage.getItem('session_id');
    if (!sessionId) {
      throw new Error('No session found');
    }
    return this.request(`/api/posts?session_id=${sessionId}`, {
      method: 'POST',
      body: JSON.stringify(postData),
    });
  }

  async updatePost(id, postData) {
    return this.request(`/api/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(postData),
    });
  }

  async deletePost(id) {
    return this.request(`/api/posts/${id}`, {
      method: 'DELETE',
    });
  }

  async getPostPerformance(postId) {
    return this.request(`/api/posts/${postId}/history`);
  }

  // Analytics methods
  async getAnalytics(platform = 'all', period = '30d') {
    console.log(`Fetching analytics for platform: ${platform}, period: ${period}`);
    const response = await this.request(`/api/analytics?platform=${platform}&period=${period}`);
    console.log('Raw analytics response:', response);
    
    // Handle the FastAPI response structure
    if (response.platform && response.period && response.data) {
      return { data: response.data };
    }
    
    // Handle other response formats
    if (response.data) {
      return response;
    } else if (response.instagram || response.facebook) {
      return { data: response };
    }
    
    console.warn('Unrecognized analytics response format:', response);
    return { 
      data: {
        instagram: response.instagram_data || null,
        facebook: response.facebook_data || null
      },
      timestamp: response.timestamp || new Date().toISOString()
    };
  }

  async getEngagementStats(platform = 'all') {
    const response = await this.request(`/api/analytics/engagement?platform=${platform}`);
    console.log('Raw engagement response:', response);
    
    if (response.data) {
      return response;
    }
    
    // Handle the FastAPI response structure
    if (response.platform && response.period && response.data) {
      return { data: response.data };
    }
    
    return {
      data: {
        [platform]: response
      }
    };
  }

  async getReachStats(platform = 'all') {
    const response = await this.request(`/api/analytics/reach?platform=${platform}`);
    console.log('Raw reach stats response:', response);
    
    if (response.data) {
      return response;
    }
    
    // Handle the FastAPI response structure
    if (response.platform && response.period && response.data) {
      return { data: response.data };
    }
    
    return {
      data: {
        [platform]: response
      }
    };
  }

  async getAnalyticsSummary(period = '30d') {
    const response = await this.request(`/api/analytics/summary?period=${period}`);
    console.log('Raw analytics summary response:', response);
    
    if (response.data) {
      return response;
    }
    
    return {
      data: response,
      timestamp: response.timestamp || new Date().toISOString()
    };
  }

  async getGrowthComparison(period = '30d') {
    const response = await this.request(`/api/analytics/growth-comparison?period=${period}`);
    console.log('Raw growth comparison response:', response);
    
    if (response.data) {
      return response;
    }
    
    return {
      data: response,
      timestamp: response.timestamp || new Date().toISOString()
    };
  }

  // Media upload
  async uploadMedia(file) {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${this.baseURL}/api/upload-media`;
    console.log(`Uploading media to: ${url}`, file.name, file.type, file.size);

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      let data = {};
      try {
        data = await response.json();
      } catch (e) {
        console.warn('Empty response from uploadMedia', e);
        throw new Error(`Upload failed for ${file.name}: No valid JSON response`);
      }

      if (!response.ok) {
        console.error('Upload failed with status:', response.status, data);
        throw new Error(data.detail || data.message || `Upload failed with status: ${response.status}`);
      }

      if (!data.url) {
        console.error('Upload response missing URL:', data);
        throw new Error(`Upload failed for ${file.name}: No URL returned in response`);
      }

      console.log('Upload successful:', data.url);
      return data;
    } catch (error) {
      console.error('Media upload error:', error);
      throw error;
    }
  }

  // Captions
  async generateCaptions(captionData) {
    return this.request('/api/generate-captions', {
      method: 'POST',
      body: JSON.stringify(captionData),
    });
  }
  
  // Calendar
  async generateContentCalendar(calendarData) {
    return this.request('/api/generate-calendar', {
      method: 'POST',
      body: JSON.stringify(calendarData),
    });
  }
  
  // Notification methods
  async getNotifications() {
    const sessionId = localStorage.getItem('session_id');
    if (!sessionId) {
      throw new Error('No session found');
    }
    return this.request(`/api/notifications?session_id=${sessionId}`);
  }

  async createNotification(type, message) {
    const sessionId = localStorage.getItem('session_id');
    if (!sessionId) {
      throw new Error('No session found');
    }
    return this.request(`/api/notifications?session_id=${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ type, message }),
    });
  }

  async markNotificationRead(notificationId) {
    const sessionId = localStorage.getItem('session_id');
    if (!sessionId) {
      throw new Error('No session found');
    }
    return this.request(`/api/notifications/${notificationId}/read?session_id=${sessionId}`, {
      method: 'PUT',
    });
  }

  async markAllNotificationsRead() {
    const sessionId = localStorage.getItem('session_id');
    if (!sessionId) {
      throw new Error('No session found');
    }
    return this.request(`/api/notifications/mark-all-read?session_id=${sessionId}`, {
      method: 'PUT',
    });
  }
  
  // Removed trending methods as requested
  
  // Config status
  async getConfigStatus() {
    return this.request('/api/config/status');
  }
}

const apiClient = new ApiClient();
export default apiClient;
