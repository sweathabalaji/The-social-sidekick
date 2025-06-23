import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  HomeIcon, 
  CalendarIcon, 
  ClockIcon, 
  ChartBarIcon,
  PlusCircleIcon 
} from '@heroicons/react/24/outline';

const Navbar = () => {
  const location = useLocation();
  
  const navItems = [
    { path: '/', icon: HomeIcon, label: 'Dashboard' },
    { path: '/scheduler', icon: PlusCircleIcon, label: 'Post Scheduler' },
    { path: '/scheduled', icon: ClockIcon, label: 'Scheduled Posts' },
    { path: '/calendar', icon: CalendarIcon, label: 'Content Calendar' },
    { path: '/analytics', icon: ChartBarIcon, label: 'Analytics' }
  ];

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-gray-900">
              📸 Social Media Assistant
            </h1>
          </div>
          
          <div className="flex space-x-8">
            {navItems.map(({ path, icon: Icon, label }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === path
                    ? 'text-primary-600 bg-primary-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;