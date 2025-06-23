import { authAPI } from './api';

class AuthService {
  constructor() {
    // Check for both old and new session storage formats
    this.sessionId = localStorage.getItem('session_id') || localStorage.getItem('sessionId');
    this.user = JSON.parse(localStorage.getItem('user') || 'null');
    
    // If we found an old format, migrate it
    if (!localStorage.getItem('session_id') && localStorage.getItem('sessionId')) {
      const oldSessionId = localStorage.getItem('sessionId');
      localStorage.setItem('session_id', oldSessionId);
      localStorage.removeItem('sessionId');
    }
  }

  async login(email, password) {
    try {
      // Basic client-side validation
      if (!email || !password) {
        return { 
          success: false, 
          error: 'Please enter both email and password.' 
        };
      }

      if (!email.includes('@')) {
        return { 
          success: false, 
          error: 'Please enter a valid email address.' 
        };
      }

      const response = await authAPI.login({ email: email.trim(), password });
      const { session_id, user, message } = response.data;
      
      this.setSession(session_id, user);
      return { 
        success: true, 
        user, 
        message: message || 'Login successful!' 
      };
    } catch (error) {
      console.error('Login error:', error);
      
      if (error.response) {
        // Server responded with error status
        const status = error.response.status;
        const detail = error.response.data?.detail;
        
        if (status === 401) {
          // Unauthorized - wrong credentials
          return { 
            success: false, 
            error: detail || 'Invalid email or password.' 
          };
        } else if (status === 400) {
          // Bad request - validation error
          return { 
            success: false, 
            error: detail || 'Please check your input and try again.' 
          };
        } else if (status === 500) {
          // Server error
          return { 
            success: false, 
            error: detail || 'Server error. Please try again later.' 
          };
        } else {
          return { 
            success: false, 
            error: detail || 'Login failed. Please try again.' 
          };
        }
      } else if (error.request) {
        // Network error
        return { 
          success: false, 
          error: 'Network error. Please check your internet connection and try again.' 
        };
      } else {
        // Other error
        return { 
          success: false, 
          error: 'An unexpected error occurred. Please try again.' 
        };
      }
    }
  }

  async register(userData) {
    try {
      // Basic client-side validation
      if (!userData.email || !userData.password) {
        return { 
          success: false, 
          error: 'Please enter both email and password.' 
        };
      }

      if (!userData.email.includes('@')) {
        return { 
          success: false, 
          error: 'Please enter a valid email address.' 
        };
      }

      if (userData.password.length < 6) {
        return { 
          success: false, 
          error: 'Password must be at least 6 characters long.' 
        };
      }

      const response = await authAPI.register({
        email: userData.email.trim(),
        password: userData.password
      });
      const { session_id, user, message } = response.data;
      
      this.setSession(session_id, user);
      return { 
        success: true, 
        user, 
        message: message || 'Account created successfully!' 
      };
    } catch (error) {
      console.error('Registration error:', error);
      
      if (error.response) {
        // Server responded with error status
        const status = error.response.status;
        const detail = error.response.data?.detail;
        
        if (status === 400) {
          // Bad request - validation error or email exists
          return { 
            success: false, 
            error: detail || 'Please check your input and try again.' 
          };
        } else if (status === 500) {
          // Server error
          return { 
            success: false, 
            error: detail || 'Server error. Please try again later.' 
          };
        } else {
          return { 
            success: false, 
            error: detail || 'Registration failed. Please try again.' 
          };
        }
      } else if (error.request) {
        // Network error
        return { 
          success: false, 
          error: 'Network error. Please check your internet connection and try again.' 
        };
      } else {
        // Other error
        return { 
          success: false, 
          error: 'An unexpected error occurred. Please try again.' 
        };
      }
    }
  }

  logout() {
    if (this.sessionId) {
      // Call logout API to remove session from database
      authAPI.logout(this.sessionId).catch(err => {
        console.error('Logout API error:', err);
        // Don't show error to user for logout
      });
    }
    this.clearSession();
    window.location.href = '/login';
  }

  setSession(sessionId, user) {
    this.sessionId = sessionId;
    this.user = user;
    localStorage.setItem('session_id', sessionId);
    localStorage.setItem('user', JSON.stringify(user));
  }

  clearSession() {
    this.sessionId = null;
    this.user = null;
    localStorage.removeItem('session_id');
    localStorage.removeItem('user');
  }

  isAuthenticated() {
    return !!this.sessionId;
  }

  getSessionId() {
    return this.sessionId;
  }

  getUser() {
    return this.user;
  }

  async verifySession() {
    if (!this.sessionId) return false;
    
    try {
      const response = await authAPI.verifySession(this.sessionId);
      if (response.data.user) {
        // Update user data if needed
        this.user = response.data.user;
        localStorage.setItem('user', JSON.stringify(this.user));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Session verification failed:', error);
      this.clearSession();
      return false;
    }
  }
}

const authService = new AuthService();
export default authService;