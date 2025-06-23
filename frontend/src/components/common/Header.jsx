import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bars3Icon, BellIcon, ArrowRightOnRectangleIcon, UserIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import '../../styles/Header.css';

const Header = () => {
  const { logout, user } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const notificationRef = useRef(null);
  const userMenuRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout();
    }
  };

  const handleNotificationClick = () => {
    setShowNotifications(!showNotifications);
    setShowUserMenu(false);
  };

  const handleUserMenuClick = () => {
    setShowUserMenu(!showUserMenu);
    setShowNotifications(false);
  };

  const userInitial = user?.email?.charAt(0)?.toUpperCase() || 'U';

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="flex justify-between items-center px-4 py-3">
        <div className="flex items-center">
          <button className="lg:hidden mr-3 text-gray-500 hover:text-gray-700">
            <Bars3Icon className="h-6 w-6" />
          </button>
          <Link 
            to="/dashboard" 
            className="text-xl font-bold header-logo"
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textDecoration: 'none',
              fontWeight: '700',
              letterSpacing: '-0.02em'
            }}
          >
            The Social Sidekick
          </Link>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Notifications Bell */}
          <div className="relative" ref={notificationRef}>
            <button 
              onClick={handleNotificationClick}
              className="relative text-gray-500 hover:text-gray-700 transition-colors duration-200 bell-icon"
              title="Notifications"
            >
              <BellIcon className="h-6 w-6" />
              {unreadCount > 0 && (
                <span className="notification-badge notification-count absolute -top-2 -right-2 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="notification-dropdown dropdown-shadow absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="font-semibold text-gray-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <button 
                      onClick={markAllAsRead}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      No notifications
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <div 
                        key={notification.id}
                        onClick={() => markAsRead(notification.id)}
                        className={`notification-item mark-read-animation p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                          !notification.read ? 'unread bg-blue-50' : 'read'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <div className={`w-2 h-2 rounded-full notification-type-${notification.type}`}></div>
                              {!notification.read && (
                                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                              )}
                            </div>
                            <p className="text-sm text-gray-900 mt-1">{notification.message}</p>
                            <p className="text-xs text-gray-500 mt-1">{notification.time}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-2 border-t border-gray-200">
                  <button className="w-full text-center text-sm text-blue-600 hover:text-blue-700 py-2">
                    View all notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="relative" ref={userMenuRef}>
            <button 
              onClick={handleUserMenuClick}
              className="flex items-center space-x-3 hover:bg-gray-50 rounded-lg p-2 transition-colors duration-200"
              title={user?.email || 'User menu'}
            >
              <div className="user-avatar h-8 w-8 rounded-full flex items-center justify-center text-white font-medium text-sm shadow-sm">
                {userInitial}
              </div>
              <div className="hidden sm:block text-left user-details">
                <div className="text-sm font-medium text-gray-900">
                  {user?.email?.split('@')[0] || 'User'}
                </div>
                <div className="text-xs text-gray-500">
                  {user?.email || 'user@example.com'}
                </div>
              </div>
            </button>

            {/* User Dropdown Menu */}
            {showUserMenu && (
              <div className="user-menu-dropdown dropdown-shadow absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center space-x-3">
                    <div className="user-avatar h-12 w-12 rounded-full flex items-center justify-center text-white font-medium text-lg">
                      {userInitial}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {user?.email?.split('@')[0] || 'User'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {user?.email || 'user@example.com'}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="py-2">
                  <button className="user-menu-item w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-3">
                    <UserIcon className="h-4 w-4" />
                    <span>Profile Settings</span>
                  </button>
                  <button className="user-menu-item w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-3">
                    <Cog6ToothIcon className="h-4 w-4" />
                    <span>Account Settings</span>
                  </button>
                </div>

                <div className="border-t border-gray-200 py-2">
                  <button 
                    onClick={handleLogout}
                    className="user-menu-item danger w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-3"
                  >
                    <ArrowRightOnRectangleIcon className="h-4 w-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;