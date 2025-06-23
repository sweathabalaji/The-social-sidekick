import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Login.css';

const Login = () => {
  const [activeTab, setActiveTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, text: '', visible: false });
  
  const { login, register, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Login form state
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: ''
  });

  // Signup form state
  const [signupForm, setSignupForm] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  });

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const switchTab = (tab) => {
    setActiveTab(tab);
    setError('');
    setSuccess('');
    setPasswordStrength({ score: 0, text: '', visible: false });
  };

  const checkPasswordStrength = (password) => {
    if (password.length === 0) {
      setPasswordStrength({ score: 0, text: '', visible: false });
      return;
    }

    let strength = 0;
    let feedback = '';

    // Length check
    if (password.length >= 8) strength++;

    // Uppercase check
    if (/[A-Z]/.test(password)) strength++;

    // Lowercase check
    if (/[a-z]/.test(password)) strength++;

    // Number check
    if (/\d/.test(password)) strength++;

    // Special character check
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;

    switch (strength) {
      case 0:
      case 1:
        feedback = 'Weak password';
        break;
      case 2:
        feedback = 'Fair password';
        break;
      case 3:
      case 4:
        feedback = 'Good password';
        break;
      case 5:
        feedback = 'Strong password';
        break;
      default:
        feedback = 'Weak password';
    }

    setPasswordStrength({ score: strength, text: feedback, visible: true });
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await login(loginForm.email, loginForm.password);
      
      if (result.success) {
        setSuccess(result.message || 'Login successful! Redirecting...');
        setTimeout(() => navigate('/dashboard'), 1500);
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Client-side validation
    if (signupForm.password !== signupForm.confirmPassword) {
      setError('Passwords do not match! Please make sure both passwords are identical.');
      setLoading(false);
      return;
    }

    if (passwordStrength.score < 3) {
      setError('Please use a stronger password. Your password should include uppercase letters, lowercase letters, numbers, and special characters.');
      setLoading(false);
      return;
    }

    try {
      const result = await register({
        email: signupForm.email,
        password: signupForm.password
      });
      
      if (result.success) {
        setSuccess(result.message || 'Account created successfully! Redirecting...');
        setTimeout(() => navigate('/dashboard'), 1500);
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    const email = prompt('Please enter your email address:');
    if (email && email.includes('@')) {
      setSuccess('Password reset instructions would be sent to your email. (Feature coming soon!)');
    } else if (email) {
      setError('Please enter a valid email address.');
    }
  };

  return (
    <div className="auth-page">
      <div className="geometric-bg"></div>
      <div className="pulse-rings">
        <div className="pulse-ring"></div>
        <div className="pulse-ring"></div>
        <div className="pulse-ring"></div>
      </div>
      <div className="floating-shapes">
        <div className="shape"></div>
        <div className="shape"></div>
        <div className="shape"></div>
        <div className="shape"></div>
        <div className="shape"></div>
        <div className="shape"></div>
      </div>

      <div className="auth-container">
        <div className="logo-section">
          <div className="logo">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="logo-image"
            />
          </div>
          <h1 className="brand-name">The Social Sidekick</h1>
          <p className="tagline">Your Social Media Assistant</p>
        </div>

        <div className="form-tabs">
          <button 
            className={`tab-btn ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => switchTab('login')}
          >
            Login
          </button>
          <button 
            className={`tab-btn ${activeTab === 'signup' ? 'active' : ''}`}
            onClick={() => switchTab('signup')}
          >
            Sign Up
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className={`form-section ${activeTab === 'login' ? 'active' : ''}`}>
          <form onSubmit={handleLoginSubmit}>
            <div className="form-group">
              <label htmlFor="login-email">Email Address</label>
              <input 
                type="email" 
                id="login-email" 
                placeholder="Enter your email" 
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                required 
              />
            </div>
            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input 
                type="password" 
                id="login-password" 
                placeholder="Enter your password" 
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                required 
              />
            </div>
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
            <div className="forgot-password">
              <button 
                type="button" 
                onClick={handleForgotPassword}
                className="forgot-password-link"
              >
                Forgot your password?
              </button>
            </div>
          </form>
        </div>

        <div className={`form-section ${activeTab === 'signup' ? 'active' : ''}`}>
          <form onSubmit={handleSignupSubmit}>
            <div className="form-group">
              <label htmlFor="signup-email">Email Address</label>
              <input 
                type="email" 
                id="signup-email" 
                placeholder="Enter your email" 
                value={signupForm.email}
                onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                required 
              />
            </div>
            <div className="form-group">
              <label htmlFor="signup-password">Password</label>
              <input 
                type="password" 
                id="signup-password" 
                placeholder="Create a password" 
                value={signupForm.password}
                onChange={(e) => {
                  setSignupForm({ ...signupForm, password: e.target.value });
                  checkPasswordStrength(e.target.value);
                }}
                required 
              />
              <div className={`password-strength ${passwordStrength.visible ? 'visible' : ''}`}>
                <div className={`strength-bar strength-${passwordStrength.score <= 1 ? 'weak' : passwordStrength.score === 2 ? 'fair' : passwordStrength.score <= 4 ? 'good' : 'strong'}`}></div>
              </div>
              <div className={`strength-text ${passwordStrength.visible ? 'visible' : ''}`}>
                {passwordStrength.text}
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="signup-confirm">Confirm Password</label>
              <input 
                type="password" 
                id="signup-confirm" 
                placeholder="Confirm your password" 
                value={signupForm.confirmPassword}
                onChange={(e) => setSignupForm({ ...signupForm, confirmPassword: e.target.value })}
                required 
              />
            </div>
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login; 