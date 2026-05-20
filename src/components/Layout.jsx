import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';

const Layout = () => {
    const { user } = useAuth();

    if (!user) return <Outlet />;

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <header className="top-header">
                    <h1>Welcome, {user.name}</h1>
                    <span className="role-badge">{user.role}</span>
                </header>
                <div className="page-content">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Layout;
