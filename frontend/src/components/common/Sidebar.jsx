import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Calendar, BarChart3, Send, Mail } from 'lucide-react';

const Sidebar = () => {
  const navItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/scheduler', label: 'Post Scheduler', icon: Send },
    { path: '/calendar', label: 'Content Calendar', icon: Calendar },
    { path: '/analytics', label: 'Analytics', icon: BarChart3 },
    { path: '/mailer', label: 'Mailer', icon: Mail },
  ];

  return (
    <aside className="sidebar">
      <nav>
        <ul className="nav-menu">
          {navItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <li key={item.path} className="nav-item">
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? 'active' : ''}`
                  }
                >
                  <IconComponent className="nav-icon" />
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;