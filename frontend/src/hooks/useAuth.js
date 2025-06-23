import { useState, useEffect, createContext, useContext } from 'react';
import authService from '../services/auth';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(authService.getUser());
  const [isAuthenticated, setIsAuthenticated] = useState(authService.isAuthenticated());
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    const verifySession = async () => {
      if (authService.isAuthenticated()) {
        try {
          const isValid = await authService.verifySession();
          if (isValid) {
            setUser(authService.getUser());
            setIsAuthenticated(true);
            setSessionError('');
          } else {
            // Session expired or invalid
            setUser(null);
            setIsAuthenticated(false);
            setSessionError('Your session has expired. Please log in again.');
            authService.clearSession();
          }
        } catch (error) {
          console.error('Session verification failed:', error);
          setUser(null);
          setIsAuthenticated(false);
          setSessionError('Session verification failed. Please log in again.');
          authService.clearSession();
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      setLoading(false);
    };

    verifySession();

    // Set up periodic session check (every 5 minutes)
    const interval = setInterval(verifySession, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const login = async (email, password) => {
    try {
      const result = await authService.login(email, password);
      if (result.success) {
        setUser(result.user);
        setIsAuthenticated(true);
        setSessionError('');
      }
      return result;
    } catch (error) {
      console.error('Login error in useAuth:', error);
      return { 
        success: false, 
        error: 'An unexpected error occurred during login.' 
      };
    }
  };

  const register = async (userData) => {
    try {
      const result = await authService.register(userData);
      if (result.success) {
        setUser(result.user);
        setIsAuthenticated(true);
        setSessionError('');
      }
      return result;
    } catch (error) {
      console.error('Registration error in useAuth:', error);
      return { 
        success: false, 
        error: 'An unexpected error occurred during registration.' 
      };
    }
  };

  const logout = () => {
    try {
      authService.logout();
      setUser(null);
      setIsAuthenticated(false);
      setSessionError('');
    } catch (error) {
      console.error('Logout error:', error);
      // Still log out locally even if API call fails
      setUser(null);
      setIsAuthenticated(false);
      authService.clearSession();
    }
  };

  const clearSessionError = () => {
    setSessionError('');
  };

  const value = {
    user,
    isAuthenticated,
    loading,
    sessionError,
    login,
    register,
    logout,
    clearSessionError
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};