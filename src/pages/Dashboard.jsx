import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useNavigate, Navigate } from 'react-router-dom';
import { Activity, Users, Settings, FileText, CreditCard, Calendar, Clock, FlaskConical } from 'lucide-react';
import Preloader from '../components/common/Preloader';

const Dashboard = () => {
    const { user } = useAuth();
    const { appointments, patients, loading } = useData();
    const navigate = useNavigate();

    // Redirect doctors straight to their clinical portal
    if (user?.role === 'Doctor') return <Navigate to="/doctor-portal" replace />;

    // Get today's date string YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];

    // Filter appointments for the logged-in doctor or all for receptionist
    const todayAppts = appointments.filter(a =>
        a.date === today &&
        (user.role === 'Doctor' ? (a.doctorName.includes(user.name) && a.status !== 'Seen') : true)
    );

    // Latest bookings (within last 24 hours) for Doctors
    const latestBookings = appointments.filter(a => {
        if (!a.createdAt || user.role !== 'Doctor') return false;
        if (!a.doctorName.includes(user.name)) return false;
        const createdDate = new Date(a.createdAt);
        const now = new Date();
        return (now - createdDate) < (24 * 60 * 60 * 1000); // 24 hours
    });

    const getRoleGuidance = (role) => {
        switch (role) {
            case 'Doctor': return 'Clinical Care Portal: Review encounters, diagnosis history, and patient charts.';
            case 'Nurse': return 'Care Coordination: Manage vitals, labs, and clinical documentation.';
            case 'Laboratory': return 'Diagnostic Center: Manage lab tests, results, and follow-ups.';
            case 'Receptionist': return 'Patient Services: Manage registry, demographics, and intake.';
            case 'Biller': return 'Revenue Cycle: Process insurance claims and manage billing records.';
            case 'Admin': return 'System Control: Manage users, credentials, and access windows.';
            case 'Pharmacist': return 'Inventory & Pharmacy: Manage drug stock and process prescriptions.';
            default: return 'Active Session: Navigate to your assigned modules using the sidebar.';
        }
    };

    if (loading) {
        return <Preloader message="Synchronizing Dashboard Data..." />;
    }

    return (
        <div className="dashboard-container">
            {/* Carepatron Workspace Header */}
            <div className="workspace-header" style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.03em' }}>
                        Good morning, {user.name.split(' ')[0]}
                    </h2>
                    <p style={{ color: 'var(--text-dim)', fontSize: '1.1rem', marginTop: '0.5rem' }}>
                        {getRoleGuidance(user.role)}
                    </p>
                </div>
                <div style={{ background: 'var(--primary-glow)', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-pill)', color: 'var(--primary)', fontWeight: 700 }}>
                    {user.role} Workspace
                </div>
            </div>

            {/* Carepatron Global Command Search */}
            <div className="command-palette-mock" style={{ marginBottom: '3rem', position: 'relative' }}>
                <input
                    type="text"
                    placeholder="Search patients, invoices, or type a command..."
                    style={{
                        width: '100%',
                        padding: '1.25rem 2rem',
                        fontSize: '1.1rem',
                        borderRadius: 'var(--radius-pill)',
                        border: '1px solid var(--border-color)',
                        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.03)',
                        background: 'var(--bg-card)'
                    }}
                />
            </div>

            <div className="quick-actions-grid">
                {(user.role === 'Receptionist' || user.role === 'Admin') && (
                    <div className="action-card" onClick={() => navigate('/patients')}>
                        <Users className="icon-main" />
                        <h3>Patient Registry</h3>
                        <p>View patient demographics and records.</p>
                    </div>
                )}

                {(user.role === 'Doctor' || user.role === 'Nurse') && (
                    <div className="action-card" onClick={() => navigate('/clinical-notes')}>
                        <FileText className="icon-main" />
                        <h3>Clinical Notes</h3>
                        <p>Access patient diagnosis and treatment history.</p>
                    </div>
                )}

                {(user.role === 'Biller' || user.role === 'Admin') && (
                    <div className="action-card" onClick={() => navigate('/billing')}>
                        <CreditCard className="icon-main" />
                        <h3>Billing & Claims</h3>
                        <p>Process insurance claims and hospital billing.</p>
                    </div>
                )}

                {(user.role === 'Pharmacist' || user.role === 'Admin') && (
                    <div className="action-card" onClick={() => navigate('/pharmacy')}>
                        <FlaskConical className="icon-main" />
                        <h3>Pharmacy</h3>
                        <p>Manage inventory and sort prescriptions.</p>
                    </div>
                )}

                {(user.role === 'Admin') && (
                    <div className="action-card" onClick={() => navigate('/admin')}>
                        <Settings className="icon-main" />
                        <h3>IT Controls</h3>
                        <p>Manage users, roles, and system security.</p>
                    </div>
                )}
            </div>

            {user.role === 'Doctor' && latestBookings.length > 0 && (
                <div className="dashboard-alert info margin-top">
                    <Clock size={18} />
                    <div className="alert-content">
                        <strong>New Appointments!</strong>
                        <span> You have {latestBookings.length} new booking(s) scheduled in the last 24 hours.</span>
                    </div>
                </div>
            )}

            <div className="dashboard-grid margin-top">
                <div className="dashboard-section card">
                    <div className="section-header">
                        <Calendar size={18} />
                        <h3>{user.role === 'Doctor' ? "Today's Patients" : "Today's Schedule"}</h3>
                    </div>
                    <div className="section-body">
                        {todayAppts.length === 0 ? (
                            <p className="empty-state">No appointments scheduled for today.</p>
                        ) : (
                            todayAppts.map(appt => {
                                const patient = patients.find(p => p.id === appt.patientId);
                                const isNew = latestBookings.some(lb => lb.id === appt.id);
                                return (
                                    <div key={appt.id} className={`appt-item ${isNew ? 'new-highlight' : ''}`}>
                                        <div className="time-col">
                                            <Clock size={14} />
                                            <span>{appt.time}</span>
                                        </div>
                                        <div className="info-col">
                                            <strong>{patient?.name}</strong>
                                            <span className="small-text">{appt.reason}</span>
                                        </div>
                                        {isNew && <span className="small-badge new">New Update</span>}
                                        <span className={`status-tag ${appt.status.toLowerCase()}`}>{appt.status}</span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                <div className="dashboard-section card">
                    <div className="section-header">
                        <Activity size={18} />
                        <h3>5G E-GURUCLINIC System Status</h3>
                    </div>
                    <div className="section-body">
                        <div className="status-row">
                            <span>Auth Server</span>
                            <span className="status-indicator active"></span>
                        </div>
                        <div className="status-row">
                            <span>PHI Database</span>
                            <span className="status-indicator active"></span>
                        </div>
                        <div className="status-row">
                            <span>Audit Logging</span>
                            <span className="status-indicator active"></span>
                        </div>
                        <div className="audit-hint margin-top">
                            <p className="small-text">All interactions are being logged for security compliance.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
