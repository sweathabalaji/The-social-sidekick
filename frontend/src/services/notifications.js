import apiClient from '../api';

// Notification Service with Backend Integration
class NotificationService {
  constructor() {
    this.notifications = [];
    this.listeners = [];
    this.isLoading = false;
    this.lastFetch = null;
    
    // Initialize with backend data
    this.loadNotificationsFromBackend();
    
    // Set up polling for real-time updates
    this.startPolling();
  }

  // Load notifications from backend
  async loadNotificationsFromBackend() {
    try {
      this.isLoading = true;
      const response = await apiClient.get('/api/notifications');
      
      if (response?.data?.notifications) {
        this.notifications = response.data.notifications.map(notif => ({
          ...notif,
          time: this.formatTimeAgo(new Date(notif.timestamp))
        }));
        this.lastFetch = new Date();
        this.notifyListeners();
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
      // Fallback to demo data if backend fails
      this.loadDemoNotifications();
    } finally {
      this.isLoading = false;
    }
  }

  // Fallback demo notifications
  loadDemoNotifications() {
    this.notifications = [
      {
        id: 'demo-1',
        type: 'info',
        message: 'Welcome to The Social Sidekick! Your notifications will appear here.',
        read: false,
        timestamp: new Date(Date.now() - 5 * 60 * 1000),
        time: '5 minutes ago'
      }
    ];
  }

  // Start polling for new notifications
  startPolling() {
    // Poll every 30 seconds for new notifications
    setInterval(async () => {
      if (!this.isLoading) {
        await this.loadNotificationsFromBackend();
      }
    }, 30000);
  }

  // Get all notifications
  getNotifications() {
    return this.notifications.map(notif => ({
      ...notif,
      time: this.formatTimeAgo(new Date(notif.timestamp))
    }));
  }

  // Add a new notification (local and backend)
  async addNotification(type, message) {
    try {
      // Check if we have a session
      const sessionId = localStorage.getItem('session_id');
      if (!sessionId) {
        console.warn('No session found for notification creation');
        // Fallback: create local-only notification
        const notification = {
          id: `local-${Date.now()}`,
          type,
          message,
          read: false,
          timestamp: new Date(),
          time: 'Just now'
        };
        
        this.notifications.unshift(notification);
        this.notifyListeners();
        
        return notification;
      }

      console.log('Creating notification:', { type, message, sessionId: sessionId.substring(0, 8) + '...' });
      
      // Add to backend
      const response = await apiClient.post('/api/notifications', { type, message });
      
      if (response?.data?.id) {
        // Create local notification object
        const notification = {
          id: response.data.id,
          type,
          message,
          read: false,
          timestamp: new Date(),
          time: 'Just now'
        };
        
        // Add to local array
        this.notifications.unshift(notification);
        this.notifyListeners();
        
        console.log('Notification created successfully:', notification.id);
        return notification;
      }
    } catch (error) {
      console.error('Failed to create notification:', error);
      
      // Fallback: create local-only notification
      const notification = {
        id: `local-${Date.now()}`,
        type,
        message,
        read: false,
        timestamp: new Date(),
        time: 'Just now'
      };
      
      this.notifications.unshift(notification);
      this.notifyListeners();
      
      return notification;
    }
  }

  // Mark notification as read
  async markAsRead(id) {
    try {
      // Update backend
      await apiClient.put(`/api/notifications/${id}/read`);
      
      // Update local state
      const notification = this.notifications.find(n => n.id === id);
      if (notification) {
        notification.read = true;
        this.notifyListeners();
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      
      // Fallback: update local state only
      const notification = this.notifications.find(n => n.id === id);
      if (notification) {
        notification.read = true;
        this.notifyListeners();
      }
    }
  }

  // Mark all as read
  async markAllAsRead() {
    try {
      // Update backend
      await apiClient.put('/api/notifications/mark-all-read');
      
      // Update local state
      this.notifications.forEach(n => n.read = true);
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      
      // Fallback: update local state only
      this.notifications.forEach(n => n.read = true);
      this.notifyListeners();
    }
  }

  // Get unread count
  getUnreadCount() {
    return this.notifications.filter(n => !n.read).length;
  }

  // Subscribe to notification changes
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  // Notify all listeners of changes
  notifyListeners() {
    this.listeners.forEach(listener => listener(this.getNotifications()));
  }

  // Refresh notifications from backend
  async refresh() {
    await this.loadNotificationsFromBackend();
  }

  // Helper to format time ago
  formatTimeAgo(timestamp) {
    const now = new Date();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    }
  }

  // Manual method to trigger demo notifications (for testing)
  addDemoNotification() {
    const demoMessages = [
      { type: 'success', message: 'Post successfully scheduled for tomorrow!' },
      { type: 'info', message: 'Your weekly analytics report is ready' },
      { type: 'warning', message: 'Instagram API rate limit approaching' },
      { type: 'success', message: 'New follower milestone reached!' },
      { type: 'info', message: 'AI content suggestions updated' }
    ];

    const randomDemo = demoMessages[Math.floor(Math.random() * demoMessages.length)];
    this.addNotification(randomDemo.type, randomDemo.message);
  }
}

// Create and export singleton instance
const notificationService = new NotificationService();

export default notificationService; 