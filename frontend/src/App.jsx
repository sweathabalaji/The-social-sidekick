import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Header from './components/common/Header';
import Sidebar from './components/common/Sidebar';
import Dashboard from './pages/Dashboard';
import Scheduler from './pages/Scheduler';
import ScheduledPosts from './pages/ScheduledPosts';
import ContentCalendar from './pages/ContentCalendar';
import Analytics from './pages/Analytics';
import Login from './pages/Login';
import './styles/components.css';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        fontSize: '1.2rem'
      }}>
        Loading...
      </div>
    );
  }
  
  return isAuthenticated ? children : <Navigate to="/login" />;
};

// App Layout Component
const AppLayout = ({ children }) => (
  <div className="app">
    <Header />
    <div className="app-body">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
    </div>
  </div>
);

// Main App Component
const AppRoutes = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route 
        path="/login" 
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />} 
      />
      <Route 
        path="/" 
        element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} />} 
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Dashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/scheduler"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Scheduler />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/scheduled"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ScheduledPosts />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ContentCalendar />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Analytics />
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;