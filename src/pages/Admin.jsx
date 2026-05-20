import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
    Users, Shield, List, RefreshCw, Trash2, UserPlus,
    Clock, Lock, MapPin, Stethoscope, ChevronDown, ChevronUp,
    Edit3, CheckCircle, XCircle, Activity, ShieldAlert, CheckCircle2,
    Layout, DoorOpen, Plus, Settings, CreditCard, DollarSign, AlertCircle
} from 'lucide-react';
import auditLogger from '../utils/auditLogger';


import { departmentService, roomService } from '../services/infrastructureService';
import { financeService } from '../services/financeService';
import Preloader from '../components/common/Preloader';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell 
} from 'recharts';

const Admin = () => {
    const { 
        user, users, addUser, toggleUserStatus, updateUser, deleteUser, resetPassword,
        cleanDuplicateUsers 
    } = useAuth();
    const { 
        appointmentFee, saveAppointmentFee, 
        departments, rooms, admissions, setDepartments, setRooms, tariffs, setTariffs,
        appointments, labOrders, claims, authorizeAppointment, authorizeLabOrder, approveClaim,
        loading: globalLoading
    } = useData();
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [apptFeeInput, setApptFeeInput] = useState('');
    const [feeLoading, setFeeLoading] = useState(false);

    // Inline edit state for specialty
    const [editingSpecialty, setEditingSpecialty] = useState(null); // userId
    const [tempSpecialty, setTempSpecialty] = useState('');
    const [roleFilter, setRoleFilter] = useState('All');

    const [newUser, setNewUser] = useState({
        email: '',
        name: '',
        password: '',
        role: 'Doctor',
        specialty: ''
    });
    const [staffSearch, setStaffSearch] = useState('');

    const [activeTab, setActiveTab] = useState('Staff'); // Staff, Infrastructure, Insurance
    const [newDept, setNewDept] = useState({ name: '', description: '' });
    const [newRoom, setNewRoom] = useState({ name: '', departmentId: '', type: 'Ward', capacity: 10, dailyRate: '5000' });
    const [newTariff, setNewTariff] = useState({ item_name: '', departmentId: '', category: 'Consultation', customCategory: '', price: '' });

    // Financial Analysis States
    const [dateRange, setDateRange] = useState({ 
        start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0], 
        end: new Date().toISOString().split('T')[0] 
    });

    const financialData = useMemo(() => {
        // Filter claims by date range AND status 'Paid'
        const filteredPaidClaims = claims.filter(c => {
            if (c.status !== 'Paid') return false;
            const cDate = (c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt || Date.now())).toISOString().split('T')[0];
            return cDate >= dateRange.start && cDate <= dateRange.end;
        });

        // 1. Time Series for Bar Chart (Revenue Trends)
        const dailyMap = filteredPaidClaims.reduce((acc, c) => {
            const date = (c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt || Date.now())).toLocaleDateString();
            acc[date] = (acc[date] || 0) + (Number(c.amount) || 0);
            return acc;
        }, {});
        const timeSeries = Object.entries(dailyMap).map(([date, amount]) => ({ date, amount }));

        // 2. Category Distribution for Pie Chart
        const catMap = filteredPaidClaims.reduce((acc, c) => {
            const cat = c.source || c.type || 'Other';
            acc[cat] = (acc[cat] || 0) + (Number(c.amount) || 0);
            return acc;
        }, {});
        const catSeries = Object.entries(catMap).map(([name, value]) => ({ name, value }));

        return { timeSeries, catSeries, totalGained: filteredPaidClaims.reduce((s, c) => s + (Number(c.amount) || 0), 0) };
    }, [claims, dateRange]);

    const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];


    // Sync fee input when context loads the value
    useEffect(() => {
        if (appointmentFee > 0 && apptFeeInput === '') {
            setApptFeeInput(String(appointmentFee));
        }
    }, [appointmentFee]);


    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (loading) return;
        
        // Prevent accidental creation
        if (!window.confirm(`Provision new account for ${newUser.name} as a ${newUser.role}?`)) return;

        setLoading(true);
        const userToCreate = { ...newUser };
        
        try {
            await addUser(userToCreate);
            auditLogger.log(user, 'WRITE', 'USER_MANAGEMENT', 'NEW',
                `Created new ${userToCreate.role}: ${userToCreate.email}`);
            
            // FIX: Keep the role and specialty for batch creation, clear name/email/pass
            setNewUser(prev => ({ ...prev, email: '', name: '', password: '' }));
            alert(`SUCCESS: ${userToCreate.role} account created for ${userToCreate.name}.`);
        } catch (err) {
            console.error("Error provisioning user:", err);
            alert(`Error: failed to provision ${userToCreate.email}. ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (u) => {
        if (window.confirm(`Send a password reset email to ${u.email}?`)) {
            try {
                await resetPassword(u);
                auditLogger.log(user, 'WRITE', 'USER_MANAGEMENT', u.id, `Sent password reset email for ${u.email}`);
                alert('Password reset link has been "sent" (Firebase simulated email).');
            } catch (err) {
                alert(`Error: ${err.message}`);
            }
        }
    };

    const handleCleanDuplicates = async () => {
        if (!window.confirm("This will scan the database and PERMANENTLY delete all duplicate ghost accounts. Continue?")) return;
        setLoading(true);
        try {
            const count = await cleanDuplicateUsers();
            alert(`Maintenance Complete: ${count} duplicate accounts were removed.`);
            auditLogger.log(user, 'WRITE', 'USER_MANAGEMENT', 'CLEANUP', `Performed manual database deduplication: ${count} removed.`);
        } catch (err) {
            alert(`Cleanup failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteUser = async (u) => {
        if (window.confirm(`Are you sure you want to PERMANENTLY delete ${u.name}?`)) {
            await deleteUser(u.id);
            auditLogger.log(user, 'WRITE', 'USER_MANAGEMENT', u.id, `Deleted staff member: ${u.email}`);
        }
    };

    const handleGrantAccess = (u) => {
        if (!u.isActive) {
            toggleUserStatus(u.id);
            auditLogger.log(user, 'WRITE', 'USER_MANAGEMENT', u.id, `Authorized staff member: ${u.email}`);
        }
        const specialtyLabel = departments.find(d => d.id === u.specialty)?.name || u.specialty;
        const specialtyLine = u.specialty ? `\nAssigned Ward: ${specialtyLabel}` : '';
        const text = `5G E-GURUCLINIC LOGIN CREDENTIALS\n--------------------\nName: ${u.name}\nPosition: ${u.role}${specialtyLine}\nEmail: ${u.email}\nSystem Username: ${u.username || u.email.split('@')[0]}\nPassword: ${u.password}\n--------------------\n`;
        navigator.clipboard.writeText(text);
        alert(`✅ Access granted and credential slip for ${u.name} copied to clipboard!`);
        auditLogger.log(user, 'READ', 'USER_MANAGEMENT', u.id, `Generated credential slip for ${u.email}`);
    };

    const handleSaveSpecialty = (u) => {
        updateUser(u.id, { specialty: tempSpecialty });
        const specialtyLabel = departments.find(d => d.id === tempSpecialty)?.name || tempSpecialty;
        auditLogger.log(user, 'WRITE', 'USER_MANAGEMENT', u.id,
            `Assigned Dr. ${u.name} to Ward: ${specialtyLabel}`);
        setEditingSpecialty(null);
        setTempSpecialty('');
    };

    const startEditSpecialty = (u) => {
        setEditingSpecialty(u.id);
        setTempSpecialty(u.specialty || '');
    };

    const handleCreateDept = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await departmentService.addDepartment(newDept.name, newDept.description);
            const depts = await departmentService.getAllDepartments();
            setDepartments(depts);
            setNewDept({ name: '', description: '' });
            auditLogger.log(user, 'WRITE', 'DEPARTMENT', 'NEW', `Created department: ${newDept.name}`);
            alert('Department added successfully!');
        } catch (err) {
            console.error(err);
            alert(`Failed to add Department. Error: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleCreateRoom = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await roomService.addRoom(newRoom);
            const rms = await roomService.getAllRooms();
            setRooms(rms);
            setNewRoom({ name: '', departmentId: '', type: 'Ward', capacity: 10 });
            auditLogger.log(user, 'WRITE', 'ROOM', 'NEW', `Created room: ${newRoom.name}`);
            alert('Room added successfully!');
        } catch (err) {
            console.error(err);
            alert(`Failed to add Room. Error: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteDept = async (id, name) => {
        if (window.confirm(`Delete department ${name}?`)) {
            setSubmitting(true);
            try {
                await departmentService.deleteDepartment(id);
                setDepartments(prev => prev.filter(d => d.id !== id));
                auditLogger.log(user, 'WRITE', 'DEPARTMENT', id, `Deleted department: ${name}`);
            } catch (err) {
                console.error(err);
                alert(`Failed to delete Department. Error: ${err.message}`);
            } finally {
                setSubmitting(false);
            }
        }
    };

    const handleDeleteRoom = async (id, name) => {
        if (window.confirm(`Delete room ${name}?`)) {
            setSubmitting(true);
            try {
                await roomService.deleteRoom(id);
                setRooms(prev => prev.filter(r => r.id !== id));
                auditLogger.log(user, 'WRITE', 'ROOM', id, `Deleted room: ${name}`);
            } catch (err) {
                console.error(err);
                alert(`Failed to delete Room. Error: ${err.message}`);
            } finally {
                setSubmitting(false);
            }
        }
    };

    const handleCreateTariff = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const tariffToSave = {
                ...newTariff,
                category: newTariff.category === 'Other' ? newTariff.customCategory || 'Other' : newTariff.category
            };
            delete tariffToSave.customCategory; // cleanup

            await financeService.addTariff(tariffToSave);
            const trfs = await financeService.getAllTariffs();
            setTariffs(trfs);
            setNewTariff({ item_name: '', departmentId: '', category: 'Consultation', customCategory: '', price: '' });
            auditLogger.log(user, 'WRITE', 'FINANCE', 'NEW_TARIFF', `Created tariff: ${newTariff.item_name}`);
            alert('Tariff added successfully!');
        } catch (err) {
            console.error(err);
            alert(`Failed to add Tariff. Error: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteTariff = async (id, name) => {
        if (window.confirm(`Delete tariff item ${name}?`)) {
            try {
                await financeService.deleteTariff(id);
                setTariffs(prev => prev.filter(t => t.id !== id));
                auditLogger.log(user, 'WRITE', 'FINANCE', id, `Deleted tariff: ${name}`);
            } catch (err) {
                console.error(err);
                alert(`Failed to delete Tariff. Error: ${err.message}`);
            }
        }
    };

    const handleSaveApptFee = async (e) => {
        e.preventDefault();
        if (!apptFeeInput || isNaN(Number(apptFeeInput))) return alert('Enter a valid amount.');
        setFeeLoading(true);
        try {
            await saveAppointmentFee(apptFeeInput);
            auditLogger.log(user, 'WRITE', 'FINANCE', 'SETTINGS', `Updated appointment consultation fee to ₦${apptFeeInput}`);
            alert(`Appointment fee updated to ₦${Number(apptFeeInput).toLocaleString()}`);
        } catch (err) {
            alert(`Failed: ${err.message}`);
        } finally {
            setFeeLoading(false);
        }
    };

    // Group staff...
    // Group staff with Search filter
    const clinicalStaff = users.filter(u => 
        (u.role === 'Doctor' || u.role === 'Nurse') &&
        (u.name.toLowerCase().includes(staffSearch.toLowerCase()) || u.email.toLowerCase().includes(staffSearch.toLowerCase()))
    );

    const filteredOthers = users.filter(u =>
        u.role !== 'Doctor' && u.role !== 'Nurse' &&
        (roleFilter === 'All' ? true : u.role === roleFilter) &&
        (u.name.toLowerCase().includes(staffSearch.toLowerCase()) || u.email.toLowerCase().includes(staffSearch.toLowerCase()))
    );

    if (globalLoading) {
        return <Preloader message="Loading System Infrastructure..." />;
    }

    if (loading) {
        return <Preloader fullPage message="Provisioning Account & Syncing Security Policies..." />;
    }

    return (
        <div className="page-container admin">
            <div className="page-header-flex">
                <div>
                    <h2>System Control Center</h2>
                    <p>Manage Staff Credentials, Ward Assignments &amp; Security Audits.</p>
                </div>
                <div className="badge admin">Superuser Authorization Active</div>
            </div>

            <div className="admin-tabs">
                <button
                    className={`tab-btn ${activeTab === 'Staff' ? 'active' : ''}`}
                    onClick={() => setActiveTab('Staff')}
                >
                    <Users size={18} /> Staff Management
                </button>
                <button
                    className={`tab-btn ${activeTab === 'Infrastructure' ? 'active' : ''}`}
                    onClick={() => setActiveTab('Infrastructure')}
                >
                    <Layout size={18} /> Infrastructure
                </button>
                <button
                    className={`tab-btn ${activeTab === 'Wards' ? 'active' : ''}`}
                    onClick={() => setActiveTab('Wards')}
                >
                    <DoorOpen size={18} /> Ward Registration
                </button>
                <button
                    className={`tab-btn ${activeTab === 'Billing' ? 'active' : ''}`}
                    onClick={() => setActiveTab('Billing')}
                >
                    <DollarSign size={18} /> Billing Control
                </button>
                <button
                    className={`tab-btn ${activeTab === 'Financials' ? 'active' : ''}`}
                    onClick={() => setActiveTab('Financials')}
                >
                    <Activity size={18} /> Financial Reports
                </button>
            </div>

            <div className="admin-grid-v2 full-width-admin">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {activeTab === 'Staff' ? (
                        <>
                            <div className="admin-section">
                                <div className="section-header">
                                    <UserPlus size={20} />
                                    <h3>Account Provisioning</h3>
                                </div>
                                <form onSubmit={handleCreateUser} className="create-user-form">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Full Name</label>
                                            <input
                                                type="text" required
                                                value={newUser.name}
                                                onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                                                placeholder="e.g. Dr. Jane Smith"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Email Address</label>
                                            <input
                                                type="email" required
                                                value={newUser.email}
                                                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                                placeholder="jane.smith@hospital.com"
                                            />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Initial Password</label>
                                            <div className="input-with-icon">
                                                <Lock size={14} />
                                                <input
                                                    type="text" required
                                                    value={newUser.password}
                                                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                                    placeholder="Temporary password"
                                                />
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>Position</label>
                                            <select
                                                value={newUser.role}
                                                onChange={e => setNewUser({ ...newUser, role: e.target.value, specialty: '' })}
                                                className="full-select"
                                            >
                                                <option value="Doctor">Doctor</option>
                                                <option value="Nurse">Nurse</option>
                                                <option value="Receptionist">Record Officer / Receptionist</option>
                                                <option value="Pharmacist">Pharmacist</option>
                                                <option value="Biller">Medical Biller</option>
                                                <option value="Laboratory">Laboratory / Lab Tech</option>
                                                <option value="Radiology">Radiology / Imaging</option>
                                                <option value="Admin">Admin</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Ward Assignment — Clinical Staff Only */}
                                    {(newUser.role === 'Doctor' || newUser.role === 'Nurse') && (
                                        <div className="form-group ward-assign-box">
                                            <label><MapPin size={14} /> Assign to Ward / Specialty</label>
                                            <select
                                                value={newUser.specialty}
                                                onChange={e => setNewUser({ ...newUser, specialty: e.target.value })}
                                                className="full-select"
                                                required={departments.length > 0}
                                            >
                                                <option value="">-- Select Primary Ward --</option>
                                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                            </select>
                                            
                                            {departments.length === 0 ? (
                                                <p className="helper-text" style={{ color: 'var(--danger-color)', marginTop: '0.5rem' }}>
                                                    ⚠️ No wards exist yet. Please go to the <strong>Infrastructure</strong> tab to create departments.
                                                </p>
                                            ) : (
                                                <p className="helper-text" style={{ marginTop: '0.5rem' }}>
                                                    This ward will appear in the Receptionist's appointment booking for patient triage.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Removed Access Window Input */}

                                    <button type="submit" className="primary-btn full-btn" disabled={loading}>
                                        {loading ? 'Provisioning Account...' : <><UserPlus size={16} /> Provision New Account</>}
                                    </button>
                                </form>
                            </div>

                            {/* ── Staff Management Table ── */}
                            <div className="admin-section">
                                <div className="section-header">
                                    <Users size={20} />
                                    <h3>Staff Accounts &amp; Ward Assignments</h3>
                                    <div className="staff-search-container" style={{ marginLeft: 'auto' }}>
                                        <input 
                                            type="text" 
                                            placeholder="Search staff by name or email..." 
                                            value={staffSearch}
                                            onChange={e => setStaffSearch(e.target.value)}
                                            className="search-input-sm"
                                        />
                                    </div>
                                </div>

                                {/* Clinical Staff with Ward Assignment */}
                                {clinicalStaff.length > 0 && (
                                    <>
                                        <div className="staff-group-label">
                                            <Stethoscope size={14} /> Clinical Staff — Ward Assignments
                                        </div>
                                        <div className="table-container mini-scroll">
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        <th>Staff Member</th>
                                                        <th>Assigned Ward</th>
                                                        <th>Status</th>
                                                        <th>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {clinicalStaff.map(u => (
                                                        <tr key={u.id}>
                                                            <td>
                                                                <div className="flex-col">
                                                                    <strong>{u.role === 'Doctor' ? 'Dr. ' : 'Nurse '}{u.name}</strong>
                                                                    <code className="small-text">{u.email}</code>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                {editingSpecialty === u.id ? (
                                                                    <div className="inline-ward-edit">
                                                                        <select
                                                                            value={tempSpecialty}
                                                                            onChange={e => setTempSpecialty(e.target.value)}
                                                                            className="ward-inline-select"
                                                                            autoFocus
                                                                        >
                                                                            <option value="">-- Select Ward --</option>
                                                                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                                        </select>
                                                                        <button className="ward-save-btn" onClick={() => handleSaveSpecialty(u)} title="Save">
                                                                            <CheckCircle size={16} />
                                                                        </button>
                                                                        <button className="ward-cancel-btn" onClick={() => setEditingSpecialty(null)} title="Cancel">
                                                                            <XCircle size={16} />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="ward-cell">
                                                                        {u.specialty ? (
                                                                            <span className="ward-tag">
                                                                                <MapPin size={12} />
                                                                                {departments.find(d => d.id === u.specialty)?.name || u.specialty}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="no-ward-tag">Not Assigned</span>
                                                                        )}
                                                                        <button className="edit-ward-btn" onClick={() => startEditSpecialty(u)} title="Edit Ward">
                                                                            <Edit3 size={13} />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td>
                                                                <span className={`badge ${u.isActive ? 'paid' : 'rejected'}`}>
                                                                    {u.isActive ? 'Authorised' : 'Pending'}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <div className="action-row-btns">
                                                                    {u.id !== user.id && (
                                                                        <>
                                                                            <button
                                                                                className={`action-link ${u.isActive ? 'secondary' : 'primary-bright'}`}
                                                                                onClick={() => toggleUserStatus(u.id)}
                                                                                title={u.isActive ? `Deactivate ${u.role} Account` : `Authorize ${u.role} Account`}
                                                                            >
                                                                                {u.isActive ? 'Deactivate' : 'Authorize'}
                                                                            </button>
                                                                            <button className="icon-btn" onClick={() => handleGrantAccess(u)} title="Grant & Copy Credentials">
                                                                                <Shield size={12} /> Grant
                                                                            </button>
                                                                            <button className="action-link info" onClick={() => handleResetPassword(u)} title="Reset Password">
                                                                                <Lock size={14} />
                                                                            </button>
                                                                            <button className="action-link danger" onClick={() => handleDeleteUser(u)} title="Delete">
                                                                                <Trash2 size={14} />
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}

                                {/* All Other Staff */}
                                <div className="staff-group-label" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Users size={14} /> Other Staff Members
                                    </div>
                                    <div className="role-filter-box">
                                        <label style={{ fontSize: '0.75rem', marginRight: '0.5rem', textTransform: 'none' }}>Filter by Role:</label>
                                        <select
                                            className="filter-select-sm"
                                            value={roleFilter}
                                            onChange={e => setRoleFilter(e.target.value)}
                                        >
                                            <option value="All">All Staff</option>
                                            <option value="Nurse">Nurses</option>
                                            <option value="Receptionist">Receptionists</option>
                                            <option value="Pharmacist">Pharmacists</option>
                                            <option value="Biller">Billers</option>
                                            <option value="Laboratory">Laboratory</option>
                                            <option value="Radiology">Radiology</option>
                                            <option value="Admin">Admins</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="table-container mini-scroll">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Staff Member</th>
                                                <th>Position</th>
                                                <th>Credentials</th>
                                                <th>Status</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredOthers.map(u => (
                                                <tr key={u.id}>
                                                    <td>
                                                        <div className="flex-col">
                                                            <strong>{u.name}</strong>
                                                        </div>
                                                    </td>
                                                    <td><span className={`role-badge ${u.role.toLowerCase().replace(' ', '')}`}>{u.role}</span></td>
                                                    <td>
                                                        <div className="credential-box">
                                                            <code>{u.email}</code>
                                                            <button className="icon-btn" title="Grant Access & Copy Credentials" onClick={() => handleGrantAccess(u)}>
                                                                <Shield size={12} /> Grant
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="flex-col">
                                                            <span className={`badge ${u.isActive ? 'paid' : 'rejected'}`}>
                                                                {u.isActive ? 'Authorised' : 'Pending'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="action-row-btns">
                                                            {u.id !== user.id && (
                                                                <>
                                                                    <button
                                                                        className={`action-link ${u.isActive ? 'secondary' : 'primary-bright'}`}
                                                                        onClick={() => toggleUserStatus(u.id)}
                                                                        title={u.isActive ? 'Deactivate Staff Account' : 'Authorize Staff Account'}
                                                                    >
                                                                        {u.isActive ? 'Deactivate' : 'Authorize'}
                                                                    </button>
                                                                    <button className="action-link info" onClick={() => handleResetPassword(u)} title="Reset Password">
                                                                        <Lock size={14} />
                                                                    </button>
                                                                    <button className="action-link danger" onClick={() => handleDeleteUser(u)} title="Delete">
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                            ) : activeTab === 'Infrastructure' ? (
                            <>
                                {/* ── Infrastructure: Departments ── */}
                                <div className="admin-section">
                                    <div className="section-header">
                                        <Layout size={20} />
                                        <h3>Hospital Departments</h3>
                                    </div>
                                    <form onSubmit={handleCreateDept} className="infra-form">
                                        <div className="form-row">
                                            <input
                                                type="text" required placeholder="Dept Name (e.g. Cardiology)"
                                                value={newDept.name}
                                                onChange={e => setNewDept({ ...newDept, name: e.target.value })}
                                            />
                                            <input
                                                type="text" placeholder="Short Description"
                                                value={newDept.description}
                                                onChange={e => setNewDept({ ...newDept, description: e.target.value })}
                                            />
                                            <button type="submit" className="primary-btn" disabled={submitting}>
                                                <Plus size={16} /> {submitting ? 'Adding...' : 'Add'}
                                            </button>
                                        </div>
                                    </form>
                                    <div className="infra-list">
                                        {departments.map(d => (
                                            <div key={d.id} className="infra-item">
                                                <div>
                                                    <strong>{d.name}</strong>
                                                    <p className="small-text">{d.description}</p>
                                                </div>
                                                <button className="action-link danger" onClick={() => handleDeleteDept(d.id, d.name)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                            ) : activeTab === 'Wards' ? (
                            <>
                                {/* ── Infrastructure: Departments (Quick Add) ── */}
                                <div className="admin-section" style={{ marginBottom: '1.5rem' }}>
                                    <div className="section-header">
                                        <Layout size={18} />
                                        <h3>Hospital Departments (Required for Wards)</h3>
                                    </div>
                                    <form onSubmit={handleCreateDept} className="infra-form">
                                        <div className="form-row">
                                            <input
                                                type="text" required placeholder="Dept Name (e.g. Cardiology)"
                                                value={newDept.name}
                                                onChange={e => setNewDept({ ...newDept, name: e.target.value })}
                                            />
                                            <input
                                                type="text" placeholder="Short Description"
                                                value={newDept.description}
                                                onChange={e => setNewDept({ ...newDept, description: e.target.value })}
                                            />
                                            <button type="submit" className="primary-btn" disabled={submitting}>
                                                <Plus size={16} /> {submitting ? 'Adding...' : 'Add Dept'}
                                            </button>
                                        </div>
                                    </form>
                                    <div className="infra-list" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                                        {departments.map(d => (
                                            <div key={d.id} className="infra-item" style={{ padding: '0.5rem', marginBottom: '0.5rem' }}>
                                                <div>
                                                    <strong>{d.name}</strong>
                                                </div>
                                                <button className="action-link danger" onClick={() => handleDeleteDept(d.id, d.name)} style={{ padding: '0.25rem' }}>
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ── Infrastructure: Rooms/Wards ── */}
                                <div className="admin-section">
                                    <div className="section-header">
                                        <DoorOpen size={20} />
                                        <h3>Rooms & Wards Registration</h3>
                                    </div>
                                    <form onSubmit={handleCreateRoom} className="infra-form">
                                        <div className="form-row">
                                            <input
                                                type="text" required placeholder="Room Name/Number"
                                                value={newRoom.name}
                                                onChange={e => setNewRoom({ ...newRoom, name: e.target.value })}
                                            />
                                            <div className="form-group" style={{ margin: 0, flex: 1 }}>
                                                <select
                                                    required={departments.length > 0}
                                                    value={newRoom.departmentId}
                                                    onChange={e => setNewRoom({ ...newRoom, departmentId: e.target.value })}
                                                >
                                                    <option value="">-- Dept --</option>
                                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                </select>
                                                {departments.length === 0 && (
                                                    <p className="helper-text" style={{ color: 'var(--danger-color)', marginTop: '0.25rem', fontSize: '0.75rem' }}>
                                                        ⚠️ Create a Department first using the form above.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="form-row" style={{ marginTop: '0.5rem' }}>
                                            <select
                                                value={newRoom.type}
                                                onChange={e => setNewRoom({ ...newRoom, type: e.target.value })}
                                            >
                                                <option value="Ward">General Ward</option>
                                                <option value="Private">Private Room</option>
                                                <option value="ICU">ICU</option>
                                                <option value="Semi-Private">Semi-Private</option>
                                            </select>
                                            <input
                                                type="number" required placeholder="Beds" style={{ width: '80px' }}
                                                value={newRoom.capacity}
                                                onChange={e => setNewRoom({ ...newRoom, capacity: parseInt(e.target.value) })}
                                            />
                                            <input
                                                type="number" required placeholder="Daily ₦" style={{ width: '100px' }}
                                                value={newRoom.dailyRate}
                                                onChange={e => setNewRoom({ ...newRoom, dailyRate: e.target.value })}
                                            />
                                            <button type="submit" className="primary-btn" disabled={departments.length === 0 || submitting}>
                                                <Plus size={16} /> {submitting ? 'Provisioning...' : 'Add Room'}
                                            </button>
                                        </div>
                                    </form>
                                    <div className="infra-list">
                                        {rooms.map(r => {
                                            const occupied = r.occupiedBeds || 0;
                                            const pct = (occupied / r.capacity) * 100;
                                            
                                            // Check for overdue renewals in this room
                                            const overdueInRoom = admissions.filter(a => {
                                                if (a.roomId !== r.id || a.status !== 'Active' || !a.nextBillingDate) return false;
                                                const nextDate = a.nextBillingDate.toDate ? a.nextBillingDate.toDate() : new Date(a.nextBillingDate);
                                                return nextDate <= new Date();
                                            }).length;

                                            return (
                                                <div key={r.id} className="infra-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <strong style={{ fontSize: '1rem', color: '#1e293b' }}>{r.name}</strong>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', border: '1px solid #dbeafe' }}>
                                                                    {departments.find(d => d.id === r.departmentId)?.name || 'Ward'}
                                                                </span>
                                                                <span className="small-text" style={{ color: '#64748b' }}>{r.type}</span>
                                                            </div>
                                                        </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        {overdueInRoom > 0 && (
                                                            <span className="badge danger" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                                                <AlertCircle size={10} /> {overdueInRoom} Overdue
                                                            </span>
                                                        )}
                                                        <span className="badge paid" style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#ecfdf5', color: '#065f46', border: '1px solid #bbf7d0' }}>
                                                            ₦{parseFloat(r.dailyRate || 0).toLocaleString()} / day
                                                        </span>
                                                        <span className={`badge ${pct >= 100 ? 'urgent' : 'paid'}`}>
                                                            {occupied} / {r.capacity} Beds
                                                        </span>
                                                        <button className="action-link danger" onClick={() => handleDeleteRoom(r.id, r.name)}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                    </div>
                                                    <div className="occupancy-bar-bg" style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
                                                        <div 
                                                            className="occupancy-bar-fill" 
                                                            style={{ 
                                                                width: `${pct}%`, 
                                                                height: '100%', 
                                                                background: pct >= 90 ? '#ef4444' : (pct >= 70 ? '#f59e0b' : '#10b981'),
                                                                transition: 'width 0.3s ease'
                                                            }} 
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                            ) : activeTab === 'Billing' ? (
                                <>
                                    {/* ── Admin Master Billing Control ── */}
                                    <div className="admin-section">
                                        <div className="section-header">
                                            <ShieldAlert size={20} style={{ color: 'var(--danger-color)' }} />
                                            <h3>Hospital-Wide Pending Transactions</h3>
                                        </div>
                                        <p className="helper-text" style={{ marginBottom: '1.5rem' }}>
                                            Operational override panel. Authorize clinical fees and release services to patients.
                                        </p>
                                        
                                        <div className="billing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
                                            {/* Unified Billing Queue */}
                                            {[...appointments.filter(a => a.status === 'PendingBilling'), 
                                              ...labOrders.filter(l => l.status === 'PendingBilling'), 
                                              ...claims.filter(c => c.status === 'Pending')].length === 0 ? (
                                                <div className="empty-state" style={{ gridColumn: '1 / -1', padding: '4rem' }}>
                                                    <CheckCircle2 size={48} style={{ color: 'var(--success-color)', marginBottom: '1rem' }} />
                                                    <p>All hospital accounts are currently balanced and cleared.</p>
                                                </div>
                                            ) : (
                                                <div className="table-container full-width-admin">
                                                    <table className="data-table">
                                                        <thead>
                                                            <tr>
                                                                <th>Patient / Service</th>
                                                                <th>Source</th>
                                                                <th>Estimated Case Value</th>
                                                                <th>Action</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {appointments.filter(a => a.status === 'PendingBilling').map(a => (
                                                                <tr key={a.id}>
                                                                    <td>
                                                                        <strong>{a.patientName}</strong><br/>
                                                                        <span className="small-text">Consultation with Dr. {a.doctorName}</span>
                                                                    </td>
                                                                    <td><span className="badge info">Reception</span></td>
                                                                    <td><strong>₦{(a.appointmentFee || appointmentFee).toLocaleString()}</strong></td>
                                                                    <td><button className="action-link" onClick={() => authorizeAppointment(a.id, user.name)}>Authorize</button></td>
                                                                </tr>
                                                            ))}
                                                            {labOrders.filter(l => l.status === 'PendingBilling').map(l => (
                                                                <tr key={l.id}>
                                                                    <td>
                                                                        <strong>{l.patientName}</strong><br/>
                                                                        <span className="small-text">Lab: {l.labTests}</span>
                                                                    </td>
                                                                    <td><span className="badge urgent">Laboratory</span></td>
                                                                    <td><span className="text-xs color-dim">Awaiting Input</span></td>
                                                                    <td><button className="action-link" onClick={() => authorizeLabOrder(l.id, user.name, 2000)}>Authorize (2k)</button></td>
                                                                </tr>
                                                            ))}
                                                            {claims.filter(c => c.status === 'Pending').map(c => (
                                                                <tr key={c.id}>
                                                                    <td>
                                                                        <strong>{c.patientName}</strong><br/>
                                                                        <span className="small-text">{c.description}</span>
                                                                    </td>
                                                                    <td><span className="badge pharmacy">{c.source || 'Other'}</span></td>
                                                                    <td><strong>₦{parseFloat(c.amount || 0).toLocaleString()}</strong></td>
                                                                    <td><button className="action-link" onClick={() => approveClaim(c.id)}>Approve</button></td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : (
                            <>
                                {/* ── Financial Intelligence & Analytics ── */}
                                <div className="admin-section">
                                    <div className="section-header" style={{ justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <Activity size={20} />
                                            <h3>Hospital Financial Health Analytics</h3>
                                        </div>
                                        <div className="date-filters" style={{ display: 'flex', gap: '10px' }}>
                                            <input 
                                                type="date" 
                                                className="filter-date-input" 
                                                value={dateRange.start} 
                                                onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} 
                                            />
                                            <input 
                                                type="date" 
                                                className="filter-date-input" 
                                                value={dateRange.end} 
                                                onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} 
                                            />
                                        </div>
                                    </div>

                                    <div className="dp-stats" style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                                        <div className="dp-stat">
                                            <span style={{ color: 'var(--success)' }}>₦{financialData.totalGained.toLocaleString()}</span>
                                            <label>Period Realized Gain</label>
                                        </div>
                                        <div className="dp-stat">
                                            <span style={{ color: 'var(--primary)' }}>{claims.filter(c => c.status === 'Paid').length}</span>
                                            <label>All-Time Cleared Bills</label>
                                        </div>
                                        <div className="dp-stat">
                                            <span style={{ color: 'var(--warning)' }}>₦{claims.filter(c => c.status === 'Pending').reduce((sum, c) => sum + (Number(c.amount) || 0), 0).toLocaleString()}</span>
                                            <label>Outstanding Claims</label>
                                        </div>
                                        <div className="dp-stat">
                                            <span style={{ color: 'var(--accent)' }}>{(financialData.totalGained / (claims.filter(c => c.status === 'Paid').length || 1)).toLocaleString(undefined, {style: 'currency', currency: 'NGN'})}</span>
                                            <label>Avg Rev per Case</label>
                                        </div>
                                    </div>

                                    {/* Visualizations Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '3rem' }}>
                                        <div className="chart-card card" style={{ padding: '1.5rem', height: '350px' }}>
                                            <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#64748b' }}>REVENUE TREND (TIME SERIES)</h4>
                                            <ResponsiveContainer width="100%" height="85%">
                                                <BarChart data={financialData.timeSeries}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                                                    <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `₦${val/1000}k`} />
                                                    <Tooltip 
                                                        contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff' }} 
                                                        itemStyle={{ color: '#10b981' }}
                                                    />
                                                    <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>

                                        <div className="chart-card card" style={{ padding: '1.5rem', height: '350px', display: 'flex', flexDirection: 'column' }}>
                                            <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#64748b' }}>REVENUE SOURCE DISTRIBUTION</h4>
                                            <ResponsiveContainer width="100%" height="90%">
                                                <PieChart>
                                                    <Pie
                                                        data={financialData.catSeries}
                                                        innerRadius={60}
                                                        outerRadius={100}
                                                        paddingAngle={5}
                                                        dataKey="value"
                                                    >
                                                        {financialData.catSeries.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip />
                                                    <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>

                                {/* ── Recent Transactions ── */}
                                <div className="admin-section" style={{ marginBottom: '2.5rem' }}>
                                    <div className="section-header">
                                        <List size={20} />
                                        <h3>Recent Transactions Overview</h3>
                                    </div>
                                    <div className="table-container mini-scroll" style={{ maxHeight: '400px' }}>
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th>Ref. Date</th>
                                                    <th>Patient Name</th>
                                                    <th>Service Type</th>
                                                    <th>Amount</th>
                                                    <th>Final Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {claims.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 15).map(c => (
                                                    <tr key={c.id}>
                                                        <td className="small-text">{c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString() : 'Pending Sync'}</td>
                                                        <td><strong>{c.patientName}</strong></td>
                                                        <td style={{ fontSize: '0.85rem' }}>{c.type}</td>
                                                        <td><strong style={{ color: 'var(--text-main)' }}>₦{Number(c.amount || 0).toLocaleString()}</strong></td>
                                                        <td>
                                                            <span className={`badge ${c.status === 'Paid' ? 'paid' : (c.status === 'Rejected' ? 'rejected' : 'pending')}`}>
                                                                {c.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {claims.length === 0 && (
                                                    <tr><td colSpan="5" className="empty-state">No financial records found in the audit trail.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                {/* ── Appointment Fee Config ── */}
                                <div className="admin-section" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #3b82f6', paddingLeft: '1rem' }}>
                                    <div className="section-header">
                                        <DollarSign size={20} style={{ color: '#3b82f6' }} />
                                        <h3>Appointment Consultation Fee</h3>
                                    </div>
                                    <p className="helper-text" style={{ marginBottom: '1rem' }}>
                                        This fee will be charged to every patient when a Receptionist books an appointment.
                                        Billing Office must collect payment before the appointment reaches the doctor's queue.
                                        Currently: <strong style={{ color: '#059669' }}>₦{(appointmentFee || 0).toLocaleString()}</strong>
                                    </p>
                                    <form onSubmit={handleSaveApptFee} className="infra-form">
                                        <div className="form-row">
                                            <input
                                                type="number"
                                                min="0"
                                                step="100"
                                                required
                                                placeholder="e.g. 5000"
                                                value={apptFeeInput}
                                                onChange={e => setApptFeeInput(e.target.value)}
                                                style={{ maxWidth: '200px' }}
                                            />
                                            <button type="submit" className="primary-btn" disabled={feeLoading}>
                                                <DollarSign size={16} /> {feeLoading ? 'Saving...' : 'Set Fee'}
                                            </button>
                                        </div>
                                    </form>
                                </div>

                                {/* ── Security & Maintenance ── */}
                                <div className="admin-section" style={{ borderLeft: '4px solid var(--danger-color)', paddingLeft: '1rem', background: '#fff1f2' }}>
                                    <div className="section-header">
                                        <ShieldAlert size={20} style={{ color: 'var(--danger-color)' }} />
                                        <h3>System Maintenance &amp; Security</h3>
                                        {(() => {
                                            const emails = users.map(u => (u.email || '').toLowerCase());
                                            const dupes = emails.filter((item, index) => emails.indexOf(item) !== index).length;
                                            return dupes > 0 ? (
                                                <span className="badge rejected" style={{ marginLeft: 'auto', padding: '4px 10px' }}>
                                                    {dupes} Duplicates Detected
                                                </span>
                                            ) : null;
                                        })()}
                                    </div>
                                    <p className="helper-text" style={{ color: '#991b1b' }}>
                                        <strong>Global Staff Sync:</strong> Scans the entire database and permanently deletes duplicate "ghost" accounts. 
                                        This will prioritize Authorized accounts and remove older duplicates.
                                    </p>
                                    <button 
                                        className="secondary-btn" 
                                        onClick={handleCleanDuplicates}
                                        style={{ border: '1px solid var(--danger-color)', color: 'var(--danger-color)', fontWeight: 800 }}
                                    >
                                        <RefreshCw size={14} /> Perform Global Staff Sync
                                    </button>
                                </div>
                                    <div className="admin-section" style={{ borderTop: '4px solid #10b981' }}>
                                        <div className="section-header">
                                            <CreditCard size={20} style={{ color: '#10b981' }} />
                                            <h3>Service Fee Inventory</h3>
                                        </div>
                                        <p className="helper-text" style={{ marginBottom: '1.5rem' }}>
                                            Document all hospital service fees (Surgery, Labour, Folders, etc.). 
                                            These items will appear as selectable plans in the Billing Office.
                                        </p>
                                        
                                        <form onSubmit={handleCreateTariff} className="infra-form" style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: newTariff.category === 'Other' ? '1fr 140px 140px 140px 120px auto' : '1fr 140px 140px 120px auto', gap: '12px', alignItems: 'end' }}>
                                                <div className="form-group">
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Service Name</label>
                                                    <input
                                                        type="text" required placeholder="e.g. Major Surgery"
                                                        value={newTariff.item_name}
                                                        onChange={e => setNewTariff({ ...newTariff, item_name: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Category</label>
                                                    <select
                                                        required
                                                        value={newTariff.category}
                                                        onChange={e => setNewTariff({ ...newTariff, category: e.target.value })}
                                                    >
                                                        {['Consultation', 'Surgery', 'Labour', 'Accommodation', 'Laboratory', 'Pharmacy', 'Nursing', 'Folder Fee', 'Other'].map(cat => (
                                                            <option key={cat} value={cat}>{cat}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                {newTariff.category === 'Other' && (
                                                    <div className="form-group">
                                                        <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Specify Category</label>
                                                        <input
                                                            type="text" required placeholder="Name..."
                                                            value={newTariff.customCategory}
                                                            onChange={e => setNewTariff({ ...newTariff, customCategory: e.target.value })}
                                                        />
                                                    </div>
                                                )}
                                                <div className="form-group">
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Assign to Dept/Ward</label>
                                                    <select
                                                        required
                                                        value={newTariff.departmentId}
                                                        onChange={e => setNewTariff({ ...newTariff, departmentId: e.target.value })}
                                                    >
                                                        <option value="">-- Select Dept --</option>
                                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                    </select>
                                                </div>
                                                <div className="form-group">
                                                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Price (₦)</label>
                                                    <input
                                                        type="number" required placeholder="₦"
                                                        value={newTariff.price}
                                                        onChange={e => setNewTariff({ ...newTariff, price: e.target.value })}
                                                    />
                                                </div>
                                                <button type="submit" className="primary-btn" style={{ padding: '0 20px', height: '42px' }}>
                                                    <Plus size={18} /> Add to Inventory
                                                </button>
                                            </div>
                                        </form>

                                        <div className="infra-list">
                                            {tariffs.map(t => (
                                                <div key={t.id} className="infra-item" style={{ background: 'white', border: '1px solid #f1f5f9', marginBottom: '8px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <strong style={{ fontSize: '1rem', color: '#334155' }}>{t.item_name}</strong>
                                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#f59e0b', background: '#fffbeb', padding: '1px 8px', borderRadius: '10px', border: '1px solid #fef3c7', textTransform: 'uppercase' }}>
                                                                {t.category || 'Service'}
                                                            </span>
                                                        </div>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6366f1', background: '#eef2ff', padding: '1px 6px', borderRadius: '4px', alignSelf: 'start' }}>
                                                            {departments.find(d => d.id === t.departmentId)?.name || 'General'}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#059669' }}>
                                                            ₦{parseFloat(t.price).toLocaleString()}
                                                        </span>
                                                        <button className="action-link danger" onClick={() => handleDeleteTariff(t.id, t.item_name)}>
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {tariffs.length === 0 && (
                                                <div className="empty-state" style={{ textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: '12px' }}>
                                                    <List size={40} style={{ color: '#cbd5e1', marginBottom: '1rem' }} />
                                                    <p style={{ color: '#64748b' }}>No service fees documented. Add your hospital's price list here.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                </div>
            </div>
        </div>
    );
};

export default Admin;
