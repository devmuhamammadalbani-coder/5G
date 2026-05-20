import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Bell, User, LogOut } from 'lucide-react';
import './Header.css';

const Header = () => {
    const { user, logout } = useAuth();

    return (
        <header className="top-header">
            <div className="header-left">
                <h1>Hospital Management System</h1>
            </div>
            <div className="header-right">
                <div className="notifications-trigger">
                    <Bell size={20} />
                    <span className="notification-dot"></span>
                </div>
                <div className="user-profile-summary">
                    <div className="user-meta">
                        <span className="user-name">{user?.name}</span>
                        <span className="user-role-badge">{user?.role}</span>
                    </div>
                    <div className="user-avatar">
                        <User size={20} />
                    </div>
                </div>
                <button className="logout-icon-btn" onClick={logout} title="Sign Out">
                    <LogOut size={20} />
                </button>
            </div>
        </header>
    );
};

export default Header;
