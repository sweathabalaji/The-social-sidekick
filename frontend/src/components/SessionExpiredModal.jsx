import React from 'react';
import './SessionExpiredModal.css';

const SessionExpiredModal = ({ show, onClose, message }) => {
  if (!show) return null;

  const handleLoginRedirect = () => {
    onClose();
    window.location.href = '/login';
  };

  return (
    <div className="session-modal-overlay">
      <div className="session-modal">
        <div className="session-modal-header">
          <h3>Session Expired</h3>
        </div>
        <div className="session-modal-body">
          <div className="session-icon">🔒</div>
          <p>{message || 'Your session has expired. Please log in again to continue.'}</p>
        </div>
        <div className="session-modal-footer">
          <button 
            className="session-btn session-btn-primary" 
            onClick={handleLoginRedirect}
          >
            Go to Login
          </button>
          <button 
            className="session-btn session-btn-secondary" 
            onClick={onClose}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionExpiredModal; 