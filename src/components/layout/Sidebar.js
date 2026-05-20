import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
    Home,
    Users,
    FileText,
    Settings,
    CreditCard,
    Activity,
    Shield,
    Calendar,
    FlaskConical,
    Stethoscope,
    Microscope,
    HeartPulse
} from 'lucide-react';
import './Sidebar.css';

const Sidebar = () => {
    const { user } = useAuth();

    const navLinks = [
        { to: '/', icon: <Home size={20} />, label: 'Dashboard', roles: ['Doctor', 'Nurse', 'Receptionist', 'Biller', 'HIM', 'Admin', 'IT Officer'] },
        { to: '/patients', icon: <Users size={20} />, label: 'Patients', roles: ['Doctor', 'Nurse', 'Receptionist', 'HIM'] },
        { to: '/appointments', icon: <Calendar size={20} />, label: 'Appointments', roles: ['Doctor', 'Nurse', 'Receptionist'] },
        { to: '/clinical-notes', icon: <FileText size={20} />, label: 'Clinical Notes', roles: ['Doctor', 'Nurse', 'HIM'] },
        { to: '/laboratory', icon: <FlaskConical size={20} />, label: 'Laboratory', roles: ['Lab Technician', 'Doctor', 'HIM'] },
        { to: '/radiology', icon: <Microscope size={20} />, label: 'Radiology', roles: ['Radiologist', 'Doctor', 'HIM'] },
        { to: '/pharmacy', icon: <HeartPulse size={20} />, label: 'Pharmacy', roles: ['Pharmacist', 'Doctor', 'HIM'] },
        { to: '/billing', icon: <CreditCard size={20} />, label: 'Billing & Claims', roles: ['Biller', 'HIM'] },
        { to: '/audit-reports', icon: <Shield size={20} />, label: 'Audit Reports', roles: ['HIM', 'Admin'] },
        { to: '/admin', icon: <Settings size={20} />, label: 'System Admin', roles: ['Admin', 'IT Officer'] }
    ];

    return (
        <aside className="sidebar" style={{ padding: '1rem', background: 'transparent', borderRight: 'none' }}>
            <div className="sidebar-logo" style={{ marginBottom: '2.5rem', padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ background: 'var(--primary)', padding: '0.5rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Activity size={24} color="white" />
                </div>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.03em' }}>Sahara EHR</span>
            </div>

            <nav className="sidebar-nav">
                {navLinks.map((link) => {
                    if (link.roles.includes(user?.role)) {
                        return (
                            <NavLink
                                key={link.to}
                                to={link.to}
                                className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
                            >
                                {link.icon}
                                <span>{link.label}</span>
                            </NavLink>
                        );
                    }
                    return null;
                })}
            </nav>
        </aside>
    );
};

export default Sidebar;
