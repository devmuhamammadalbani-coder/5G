import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
    Home, Users, FileText, Settings, LogOut,
    CreditCard, Stethoscope, MapPin, FlaskConical, Mail, Scan, Activity
} from 'lucide-react';

const Sidebar = () => {
    const { user, logout } = useAuth();
    const { notifications } = useData();
    const location = useLocation();

    const uid = user?.id || user?.uid;
    const unreadCount = notifications.filter(n => 
        n.type === 'MEMO' && 
        n.fromUserId !== uid && 
        (n.toUserId === uid || (Array.isArray(n.toUserIds) && n.toUserIds.includes(uid))) &&
        (!n.readBy || !n.readBy[uid])
    ).length;

    const navLinks = [
        // Doctors go straight to their portal — no general dashboard link
        { to: '/doctor-portal', icon: <Stethoscope size={20} />, label: 'My Clinical Queue', roles: ['Doctor'] },

        // Nurses go straight to their portal
        { to: '/nurse-portal', icon: <Activity size={20} />, label: 'Nursing Station', roles: ['Nurse'] },

        // All other roles see the general dashboard — Lab goes directly to /laboratory so no dash link
        { to: '/', icon: <Home size={20} />, label: 'Dashboard', roles: ['Receptionist', 'Biller', 'Admin', 'Pharmacist', 'Radiology'] },

        // Patient Registry — Lab, Doctor, and Nurse excluded
        { to: '/patients', icon: <Users size={20} />, label: 'Patient Registry', roles: ['Receptionist', 'Admin'] },

        { to: '/pharmacy', icon: <FlaskConical size={20} />, label: 'Pharmacy', roles: ['Pharmacist', 'Admin'] },

        { to: '/billing', icon: <CreditCard size={20} />, label: 'Billing & Claims', roles: ['Biller'] },

        // Lab ONLY sees Laboratory
        { to: '/laboratory', icon: <FlaskConical size={20} />, label: 'Laboratory', roles: ['Laboratory', 'Admin'] },
        
        // Radiology
        { to: '/radiology', icon: <Scan size={20} />, label: 'Radiology', roles: ['Radiology', 'Admin'] },

        { to: '/admin', icon: <Settings size={20} />, label: 'System Admin', roles: ['Admin'] },
        { to: '/audit-logs', icon: <FileText size={20} />, label: 'Audit Logs', roles: ['Admin'] },
        { to: '/memo', icon: <Mail size={20} />, label: 'Internal Memo', roles: ['Doctor', 'Nurse', 'Receptionist', 'Biller', 'Pharmacist', 'Laboratory', 'Radiology', 'Admin'] },
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
                    <img src="/logo.png" alt="5G EGuruClinic Logo" style={{ width: '32px', height: '32px' }} />
                    <h2 style={{ margin: 0 }}>5G EGuruClinic</h2>
                </div>
                <div className="user-info">
                    <p className="user-name">{user?.name}</p>
                    <span className="user-role badge">{user?.role}</span>
                    {/* Show assigned ward for doctors */}
                    {user?.role === 'Doctor' && user?.specialty && (
                        <span className="ward-side-badge">
                            <MapPin size={11} /> {user.specialty}
                        </span>
                    )}
                </div>
            </div>

            <nav className="sidebar-nav">
                {navLinks.map((link) => {
                    if (!link.roles.includes(user?.role)) return null;
                    if (link.to === '/admin' || link.to === '/audit-logs') return null; // handle these separately
                    return (
                        <NavLink
                            key={link.to}
                            to={link.to}
                            end={link.to === '/'}
                            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
                        >
                            {link.icon}
                            <span>{link.label}</span>

                            {/* Unread Memo Badge */}
                            {link.to === '/memo' && location.pathname !== '/memo' && unreadCount > 0 && (
                                <span className="nav-memo-badge">{unreadCount}</span>
                            )}
                        </NavLink>
                    );
                })}

                {user?.role === 'Admin' && (
                    <>
                        <div className="sidebar-section-title" style={{ marginTop: '1rem', padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Security & Logs
                        </div>
                        <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                            <Settings size={20} />
                            <span>System Admin</span>
                        </NavLink>
                        <NavLink to="/audit-logs" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                            <FileText size={20} />
                            <span>Audit Logs</span>
                        </NavLink>
                    </>
                )}
            </nav>

            <div className="sidebar-footer">
                <button onClick={logout} className="logout-btn">
                    <LogOut size={20} />
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
