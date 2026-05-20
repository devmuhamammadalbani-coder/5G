import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
    Search, UserPlus, Eye, X, Calendar, User, Folder,
    Clock, CheckCircle2, AlertCircle, MapPin, Stethoscope,
    Plus, ChevronRight, ShieldCheck, ShieldOff, ClipboardList
} from 'lucide-react';
import PatientRegistration from '../components/record-officer/PatientRegistration';
import auditLogger from '../utils/auditLogger';
import Preloader from '../components/common/Preloader';

import { departmentService } from '../services/infrastructureService';

const Patients = () => {
    const { user, users } = useAuth();
    const {
        patients, appointments, bookAppointment, completeAppointment,
        notes, progressNotes, loading, appointmentFee,
        prescriptions, labOrders, imagingOrders, claims
    } = useData();

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [activeTab, setActiveTab] = useState('demographics');
    const [departments, setDepartments] = useState([]);

    useEffect(() => {
        const fetchDepts = async () => {
            const depts = await departmentService.getAllDepartments();
            setDepartments(depts);
        };
        fetchDepts();
    }, []);

    // Modals
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [expandedApptId, setExpandedApptId] = useState(null); // Track which appointment is open

    // Booking form state
    const [bookingForm, setBookingForm] = useState({
        ward: '',
        doctorId: '',
        date: '',
        time: '',
        reason: '',
        priority: 'Normal'
    });
    const [bookingStep, setBookingStep] = useState(1); // 1 = ward select, 2 = doctor + details
    const [bookingSubmitted, setBookingSubmitted] = useState(false);

    // Filtered patients (Sorted by registration date: newest first)
    const filteredPatients = useMemo(() => {
        const results = patients.filter(p =>
            (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.patientID || p.id || '').toString().includes(searchTerm)
        );
        return results.sort((a, b) => {
            const dateA = new Date(a.registeredAt || a.createdAt || 0);
            const dateB = new Date(b.registeredAt || b.createdAt || 0);
            return dateB - dateA;
        });
    }, [patients, searchTerm]);

    // Authorized doctors (isActive === true, role === 'Doctor')
    const authorizedDoctors = useMemo(() =>
        users.filter(u => u.role === 'Doctor' && u.isActive === true),
        [users]);

    // Doctors filtered by selected ward (doctors who have specialty matching ward, or all if ward not set yet)
    const doctorsForWard = useMemo(() => {
        if (!bookingForm.ward) return [];
        return authorizedDoctors.filter(d => d.specialty === bookingForm.ward);
    }, [authorizedDoctors, bookingForm.ward]);

    // Patient appointment data
    const patientAppts = useMemo(() =>
        appointments.filter(a => a.patientId === selectedPatient?.id || (selectedPatient?.patientID && a.patientId === selectedPatient?.patientID))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
        [appointments, selectedPatient]);

    const upcomingAppts = patientAppts.filter(a => a.status === 'Scheduled' || a.status === 'PendingBilling');
    const historyAppts = patientAppts.filter(a => a.status === 'Seen');
    const patientNotes = notes.filter(n => n.patientId === selectedPatient?.id || (selectedPatient?.patientID && n.patientId === selectedPatient?.patientID));

    const patientContinuousSheet = useMemo(() => {
        if (!selectedPatient) return [];
        return progressNotes.filter(n => n.patientId === selectedPatient.id || (selectedPatient.patientID && n.patientId === selectedPatient.patientID))
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    }, [progressNotes, selectedPatient]);

    const openBookingModal = () => {
        setBookingForm({ ward: '', doctorId: '', date: '', time: '', reason: '', priority: 'Normal' });
        setBookingStep(1);
        setBookingSubmitted(false);
        setShowBookingModal(true);
    };

    const handleBookAppt = async (e) => {
        e.preventDefault();

        if (!bookingForm.ward) {
            alert('Please select a Ward first.');
            setBookingStep(1);
            return;
        }
        if (!bookingForm.date || !bookingForm.time) {
            alert('Please select both Date and Time for the appointment.');
            return;
        }

        const doctor = users.find(u => u.id === bookingForm.doctorId);
        const dept = departments.find(d => d.id === bookingForm.ward);
        const wardLabel = dept?.name || bookingForm.ward;

        // Store doctorName in a consistent format — DoctorPortal filters by this
        const doctorName = doctor ? `Dr. ${doctor.name}` : `General ${wardLabel} Queue`;

        try {
            await bookAppointment({
                ward: wardLabel,           // human-readable ward name
                wardId: bookingForm.ward,  // original ward ID for ID-based matching
                doctorId: null,            // No doctor assigned yet
                doctorName: 'Unassigned (Awaiting Nurse Triage)',
                date: bookingForm.date,
                time: bookingForm.time,
                reason: bookingForm.reason,
                priority: bookingForm.priority,
                patientId: selectedPatient.id,
                patientName: selectedPatient.name,
                isGeneralQueue: true,
                status: 'PendingBilling',
            });

            auditLogger.log(user, 'WRITE', 'APPOINTMENT', selectedPatient.id,
                `Booked appointment in ${wardLabel} (${doctorName})`);

            setBookingSubmitted(true);
        } catch (err) {
            console.error('Booking error:', err);
            alert(`Failed to book appointment: ${err.message}`);
        }
    };

    const closeBookingModal = () => {
        setShowBookingModal(false);
        setBookingSubmitted(false);
    };

    const today = new Date().toISOString().split('T')[0];

    if (loading) {
        return <Preloader message="Fetching Patient Records..." />;
    }

    return (
        <div className="page-container">
            {/* ── Page Header ── */}
            <div className="page-header-flex">
                <div>
                    <h2>Patient Registry & Profiles</h2>
                    <p>Standardized Health Records Management.</p>
                </div>
                {(user.role === 'Receptionist') && (
                    <button className="primary-btn flex-btn" onClick={() => setShowRegisterModal(true)}>
                        <UserPlus size={18} /> Register Patient
                    </button>
                )}
            </div>

            {/* Rest of the component... */}

            {/* ── Full-Screen Registration Modal ── */}
            {showRegisterModal && (
                <div className="modal-backdrop-full">
                    <div className="modal-content-full">
                        <PatientRegistration
                            onComplete={() => setShowRegisterModal(false)}
                            onCancel={() => setShowRegisterModal(false)}
                        />
                    </div>
                </div>
            )}

            {/* ── Search ── */}
            <div className="search-bar-container">
                <div className="search-input-wrapper">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search by name or Patient ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>
            </div>

            {/* ── Main Registry Layout ── */}
            <div className="registry-layout">
                {/* Patient List Table */}
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Reg_No / ID</th>
                                <th>Full Name</th>
                                <th>Age / Gender</th>
                                <th>Reg. Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPatients.length === 0 ? (
                                <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No patients found.</td></tr>
                            ) : filteredPatients.map(p => (
                                <tr key={p.id} className={selectedPatient?.id === p.id ? 'selected-row' : ''}>
                                    <td style={{ fontFamily: 'monospace', color: '#0369a1', fontWeight: 600 }}>{p.patientID || '—'}</td>
                                    <td><strong>{p.name}</strong></td>
                                    <td>{p.age ? `${p.age}y` : '—'} / {p.gender || '—'}</td>
                                    <td>{p.registeredAt ? new Date(p.registeredAt).toLocaleDateString() : '—'}</td>
                                    <td>
                                        <button className="action-link" onClick={() => { setSelectedPatient(p); setActiveTab('demographics'); }}>
                                            <Eye size={16} /> Open Profile
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ── Patient Details Panel ── */}
                {selectedPatient && (
                    <div className="details-panel">
                        <div className="panel-header">
                            <h3>{selectedPatient.name}</h3>
                            <button onClick={() => setSelectedPatient(null)} className="close-btn"><X size={18} /></button>
                        </div>

                        {/* Tabs */}
                        <div className="profile-tabs" style={{ padding: '0 1.5rem', margin: 0 }}>
                            <button className={`tab-btn ${activeTab === 'demographics' ? 'active' : ''}`} onClick={() => setActiveTab('demographics')}><User size={16} /> Info</button>
                            <button className={`tab-btn ${activeTab === 'appointments' ? 'active' : ''}`} onClick={() => setActiveTab('appointments')}>
                                <Calendar size={16} /> Appointments
                                {upcomingAppts.length > 0 && <span className="appt-badge">{upcomingAppts.length}</span>}
                            </button>
                            {(user.role === 'Doctor' || user.role === 'Nurse' || user.role === 'Laboratory') && (
                                <>
                                    <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
                                        <Folder size={15} /> Clinical Records
                                    </button>
                                    <button className={`tab-btn ${activeTab === 'continuous' ? 'active' : ''}`} onClick={() => setActiveTab('continuous')}>
                                        <ClipboardList size={15} /> Continuous Sheet
                                    </button>
                                    <button className={`tab-btn ${activeTab === 'insurance' ? 'active' : ''}`} onClick={() => setActiveTab('insurance')}>
                                        <ShieldCheck size={15} /> Insurance & Billing
                                    </button>
                                </>
                            )}
                        </div>

                        <div className="panel-body profile-scroll">
                            {/* ── Demographics Tab ── */}
                            {activeTab === 'demographics' && (
                                <>
                                    <div className="profile-header-card">
                                        <div className="profile-photo-large">
                                            {selectedPatient.photo
                                                ? <img src={selectedPatient.photo} alt="Patient" />
                                                : <User size={40} className="placeholder-icon" />}
                                        </div>
                                        <div className="profile-primary-meta">
                                            <h4>{selectedPatient.name}</h4>
                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                <div className="status-pill active">{selectedPatient.status || 'Active'}</div>
                                                <div style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', fontSize: '0.85rem', color: '#334155', border: '1px solid #cbd5e1' }}>Reg. No: <strong>{selectedPatient.patientID || 'N/A'}</strong></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="info-grid-v3">
                                        <div className="detail-item"><label>Age / DOB</label><span>{selectedPatient.age} yrs ({selectedPatient.dob})</span></div>
                                        <div className="detail-item"><label>Gender</label><span>{selectedPatient.gender || '—'}</span></div>
                                        <div className="detail-item"><label>Marital Status</label><span>{selectedPatient.maritalStatus || '—'}</span></div>
                                        <div className="detail-item"><label>Occupation</label><span>{selectedPatient.occupation || '—'}</span></div>
                                    </div>

                                    <h4 className="sub-section-title">Contact Information</h4>
                                    <div className="detail-item"><label>Phone</label><span>{selectedPatient.phonePrimary}{selectedPatient.phoneSecondary && ` / ${selectedPatient.phoneSecondary}`}</span></div>
                                    <div className="detail-item"><label>Email</label><span>{selectedPatient.email || 'None'}</span></div>
                                    <div className="detail-item"><label>Address</label><span>{selectedPatient.address}{selectedPatient.lga && `, ${selectedPatient.lga}`}{selectedPatient.state && `, ${selectedPatient.state}`}</span></div>

                                    <h4 className="sub-section-title">Next of Kin</h4>
                                    <div className="nok-card-v3">
                                        <div className="detail-item"><label>Full Name</label><span>{selectedPatient.nokFullName || '—'}</span></div>
                                        <div className="detail-item"><label>Relationship</label><span>{selectedPatient.nokRelationship || '—'}</span></div>
                                        <div className="detail-item"><label>Contact</label><span>{selectedPatient.nokPhone || '—'}</span></div>
                                    </div>

                                    <h4 className="sub-section-title">Insurance / Billing</h4>
                                    <div className="detail-item">
                                        <label>Payment Method</label>
                                        <span className={`payment-tag ${(selectedPatient.paymentType || '').toLowerCase()}`}>
                                            {selectedPatient.paymentType === 'Insurance' ? `HMO: ${selectedPatient.hmoProvider}` : 'Private Cash'}
                                        </span>
                                    </div>
                                    {selectedPatient.hmoID && <div className="detail-item"><label>HMO Number</label><span>{selectedPatient.hmoID}</span></div>}
                                </>
                            )}

                            {/* ── Appointments Tab (Consolidated Encounter View) ── */}
                            {activeTab === 'appointments' && (
                                <div className="appt-tab-content">
                                    {/* Book Button - Receptionist Only */}
                                    {user.role === 'Receptionist' && (
                                        <button className="book-appt-trigger" onClick={openBookingModal}>
                                            <Plus size={18} /> Book New Appointment
                                        </button>
                                    )}

                                    <div className="appt-timeline-v4">
                                        {patientAppts.length === 0 ? (
                                            <div className="appt-empty">No clinical encounters recorded for this patient.</div>
                                        ) : patientAppts.map(a => {
                                            const isExpanded = expandedApptId === a.id;
                                            
                                            // Group data for THIS appointment
                                            const apptNotes = notes.filter(n => n.appointmentId === a.id);
                                            const apptProgress = progressNotes.filter(n => n.appointmentId === a.id);
                                            const apptLabs = labOrders.filter(l => l.appointmentId === a.id);
                                            const apptImaging = imagingOrders.filter(i => i.appointmentId === a.id);
                                            const apptMeds = prescriptions.filter(p => p.appointmentId === a.id);
                                            const apptBilling = claims.filter(c => c.appointmentId === a.id);
                                            const totalSpent = apptBilling.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

                                            return (
                                                <div key={a.id} className={`encounter-folder ${isExpanded ? 'expanded' : ''}`}>
                                                    <div className="encounter-summary" onClick={() => setExpandedApptId(isExpanded ? null : a.id)}>
                                                        <div className="encounter-date">
                                                            <Calendar size={16} />
                                                            <span>{new Date(a.date).toLocaleDateString()}</span>
                                                            <span className="encounter-time">{a.time}</span>
                                                        </div>
                                                        <div className="encounter-ward">
                                                            <MapPin size={14} />
                                                            <span>{a.ward}</span>
                                                        </div>
                                                        <div className="encounter-doctor">
                                                            <Stethoscope size={14} />
                                                            <span>{a.doctorName}</span>
                                                        </div>
                                                        <div className="encounter-badges">
                                                            {apptLabs.length > 0 && <span className="mini-badge lab">Lab</span>}
                                                            {apptMeds.length > 0 && <span className="mini-badge med">Meds</span>}
                                                            <span className={`status-pill-mini ${a.status.toLowerCase()}`}>{a.status}</span>
                                                        </div>
                                                        <div className="encounter-chevron">
                                                            <ChevronRight size={18} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: '0.2s' }} />
                                                        </div>
                                                    </div>

                                                    {isExpanded && (
                                                        <div className="encounter-details fade-in">
                                                            {/* 1. Vitals Header Bar */}
                                                            {a.vitals && (
                                                                <div className="vitals-strip">
                                                                    <div className="vitals-strip-item">
                                                                        <span className="v-label">BP</span>
                                                                        <span className="v-val">{a.vitals.bp || '—'}</span>
                                                                    </div>
                                                                    <div className="vitals-strip-item">
                                                                        <span className="v-label">TEMP</span>
                                                                        <span className="v-val">{a.vitals.temp || '—'}°C</span>
                                                                    </div>
                                                                    <div className="vitals-strip-item">
                                                                        <span className="v-label">PULSE</span>
                                                                        <span className="v-val">{a.vitals.pulse || '—'} bpm</span>
                                                                    </div>
                                                                    <div className="vitals-strip-item">
                                                                        <span className="v-label">SPO2</span>
                                                                        <span className="v-val">{a.vitals.spo2 || '—'}%</span>
                                                                    </div>
                                                                    <div className="vitals-strip-item">
                                                                        <span className="v-label">WEIGHT</span>
                                                                        <span className="v-val">{a.vitals.weight || '—'}kg</span>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div className="encounter-main-grid">
                                                                {/* LEFT: Clinical Narrative */}
                                                                <div className="encounter-content-area">
                                                                    <section className="chart-section">
                                                                        <h4 className="chart-title"><ClipboardList size={16} /> Clinical Findings & Progress</h4>
                                                                        <div className="narrative-stack">
                                                                            {[...apptNotes, ...apptProgress].map(n => (
                                                                                <div key={n.id} className="narrative-card">
                                                                                    <div className="card-header">
                                                                                        <span className="author">{n.provider}</span>
                                                                                        <span className="role-tag">{n.role}</span>
                                                                                    </div>
                                                                                    <div className="card-body">
                                                                                        {n.diagnosis && <div className="diagnosis-highlight">Diagnosis: {n.diagnosis}</div>}
                                                                                        <p>{n.content || n.text}</p>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                            {apptNotes.length === 0 && apptProgress.length === 0 && (
                                                                                <div className="empty-state-mini">No clinical entries for this visit.</div>
                                                                            )}
                                                                        </div>
                                                                    </section>

                                                                    <section className="chart-section" style={{ marginTop: '1.5rem' }}>
                                                                        <h4 className="chart-title"><Folder size={16} /> Investigations & Results</h4>
                                                                        <div className="investigations-list">
                                                                            {[...apptLabs, ...apptImaging].map(inv => (
                                                                                <div key={inv.id} className="investigation-row">
                                                                                    <div className="inv-meta-line">
                                                                                        <span className={`type-tag ${inv.testName ? 'lab' : 'rad'}`}>{inv.testName ? 'LAB' : 'RAD'}</span>
                                                                                        <div className="inv-name-col">
                                                                                            <strong>{inv.testName || inv.scanType}</strong>
                                                                                            <span className="inv-status-text">{inv.status}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="inv-result-col">
                                                                                        {inv.result ? (
                                                                                            <div className="result-bubble">{inv.result}</div>
                                                                                        ) : <span className="muted italic">Pending results...</span>}
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                            {apptLabs.length === 0 && apptImaging.length === 0 && (
                                                                                <div className="empty-state-mini">No investigations ordered.</div>
                                                                            )}
                                                                        </div>
                                                                    </section>
                                                                </div>

                                                                {/* RIGHT: Meds & Billing */}
                                                                <div className="encounter-sidebar-area">
                                                                    <section className="sidebar-section">
                                                                        <h4 className="chart-title"><CheckCircle2 size={16} /> Prescriptions</h4>
                                                                        <div className="meds-list">
                                                                            {apptMeds.map(p => (
                                                                                <div key={p.id} className="med-card-mini">
                                                                                    <div className="med-name">{p.medication}</div>
                                                                                    <div className="med-dosage">{p.dosage}</div>
                                                                                    {p.instructions && <div className="med-note">"{p.instructions}"</div>}
                                                                                </div>
                                                                            ))}
                                                                            {apptMeds.length === 0 && <div className="empty-state-mini">No medications.</div>}
                                                                        </div>
                                                                    </section>

                                                                    <section className="sidebar-section billing-section" style={{ marginTop: '1.5rem' }}>
                                                                        <h4 className="chart-title"><ShieldCheck size={16} /> Billing Summary</h4>
                                                                        <div className="billing-box">
                                                                            {apptBilling.map(b => (
                                                                                <div key={b.id} className="billing-row">
                                                                                    <span>{b.label || b.description || b.type}</span>
                                                                                    <strong>₦{Number(b.amount || 0).toLocaleString()}</strong>
                                                                                </div>
                                                                            ))}
                                                                            <div className="billing-divider"></div>
                                                                            <div className="billing-total">
                                                                                <span>Total Encounter</span>
                                                                                <span className="total-val">₦{totalSpent.toLocaleString()}</span>
                                                                            </div>
                                                                            <div className="payment-confirmation">
                                                                                <ShieldCheck size={14} /> Account Fully Settled
                                                                            </div>
                                                                        </div>
                                                                    </section>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── Clinical Folder Tab ── */}
                            {activeTab === 'history' && (
                                <div className="clinical-folder">
                                    <h4>Clinical Case History</h4>
                                    {patientNotes.length === 0
                                        ? <p className="small-text">No clinical records in this folder.</p>
                                        : patientNotes.map(n => (
                                            <div key={n.id} className="note-card-mini">
                                                <div className="small-text">
                                                    {n.timestamp ? (new Date(n.timestamp).toLocaleString()) : 'Unknown Date'} — {n.provider}
                                                </div>
                                                <p>{n.content || n.notes || n.diagnosis}</p>
                                            </div>
                                        ))
                                    }
                                </div>
                            )}

                            {/* ── Continuous Sheet Tab ── */}
                            {activeTab === 'continuous' && (
                                <div className="continuous-sheet-container" style={{ padding: '0' }}>
                                    <div className="sheet-paper" style={{ width: '100%', maxWidth: '100%', boxSshadow: 'none', minHeight: 'auto', padding: '1.5rem' }}>
                                        <div className="sheet-header">
                                            <div className="hospital-brand">
                                                <h4>5G E-GURU CLINIC</h4>
                                                <p>CONTINUOUS MEDICAL PROGRESS RECORD</p>
                                            </div>
                                        </div>

                                        <div className="sheet-timeline">
                                            {patientContinuousSheet.length === 0 ? (
                                                <div className="sheet-empty">No entries in the continuous sheet.</div>
                                            ) : (
                                                patientContinuousSheet.map((entry, idx) => (
                                                    <div key={entry.id || idx} className="sheet-entry">
                                                        <div className="entry-left">
                                                            <span className="entry-date">{new Date(entry.timestamp).toLocaleDateString()}</span>
                                                            <span className="entry-time">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                            {entry.duration && <span className="entry-duration">{entry.duration} mins</span>}
                                                        </div>
                                                        <div className="entry-right">
                                                            <div className="entry-role">
                                                                <span className={`role-badge ${entry.role?.toLowerCase()}`}>{entry.role}</span>
                                                                <strong>{entry.provider}</strong>
                                                                <span className="entry-type">{entry.type}</span>
                                                            </div>
                                                            <div className="entry-content">
                                                                {entry.vitals && (
                                                                    <div className="entry-vitals-mini">
                                                                        BP: {entry.vitals.bp || '—'} | T: {entry.vitals.temp || '—'} | P: {entry.vitals.pulse || '—'}
                                                                    </div>
                                                                )}
                                                                <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{entry.text || entry.content || entry.notes}</p>
                                                                {entry.imageUrl && (
                                                                    <div className="sheet-scan-preview" onClick={() => window.open(entry.imageUrl)}>
                                                                        <img src={entry.imageUrl} alt="Digital Scan" />
                                                                        <div className="scan-label" style={{ background: 'rgba(0,0,0,0.5)', color: 'white', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem' }}><Eye size={10} /> Scan Attached</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="entry-footer">
                                                                <div className="entry-sig" style={{ fontSize: '1rem' }}>Digitally Signed: {entry.provider}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Booking Modal ── */}
            {showBookingModal && (
                <div className="modal-backdrop">
                    <div className="booking-modal">
                        {/* Header */}
                        <div className="booking-modal-header">
                            <div>
                                <h3><Calendar size={20} /> Book Appointment</h3>
                                <p className="booking-patient-name">{selectedPatient?.name}</p>
                            </div>
                            <button className="close-btn" onClick={closeBookingModal}><X size={20} /></button>
                        </div>

                        {bookingSubmitted ? (
                            /* ── SUCCESS STATE ── */
                            <div className="booking-success">
                                <div className="success-icon"><CheckCircle2 size={56} /></div>
                                <h3>Appointment Submitted!</h3>
                                <p>
                                    <strong>{selectedPatient?.name}</strong> has been scheduled at{' '}
                                    <strong>{departments.find(d => d.id === bookingForm.ward)?.name}</strong> on{' '}
                                    <strong>{bookingForm.date}</strong> at <strong>{bookingForm.time}</strong>.
                                </p>
                                <div style={{
                                    background: '#fef3c7',
                                    border: '1px solid #fcd34d',
                                    borderRadius: '10px',
                                    padding: '0.85rem 1.1rem',
                                    marginTop: '0.75rem',
                                    textAlign: 'left',
                                    fontSize: '0.87rem'
                                }}>
                                    <strong style={{ color: '#92400e' }}>⚠️ Payment Required</strong><br />
                                    The patient must pay the consultation fee of{' '}
                                    <strong style={{ color: '#059669' }}>₦{(appointmentFee || 0).toLocaleString()}</strong>{' '}
                                    at the <strong>Billing Office</strong> before this appointment will appear on the doctor's queue.
                                </div>
                                <div className="booking-success-actions">
                                    <button className="primary-btn" onClick={() => { setBookingSubmitted(false); setBookingStep(1); setBookingForm({ ward: '', doctorId: '', date: '', time: '', reason: '', priority: 'Normal' }); }}>
                                        Book Another
                                    </button>
                                    <button className="secondary-btn" onClick={closeBookingModal}>Close</button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleBookAppt} className="booking-modal-body">
                                {/* ── Step 1: Ward Selection ── */}
                                {bookingStep === 1 && (
                                    <div className="booking-step fade-in">
                                        <div className="booking-step-title">
                                            <span className="step-num">1</span> Select Ward / Department
                                        </div>
                                        <p className="booking-hint">Choose the clinical area the patient requires.</p>
                                        <div className="ward-grid">
                                            {departments.map(w => (
                                                <button
                                                    key={w.id}
                                                    type="button"
                                                    className={`ward-option ${bookingForm.ward === w.id ? 'selected' : ''}`}
                                                    onClick={() => setBookingForm(prev => ({ ...prev, ward: w.id, doctorId: '' }))}
                                                >
                                                    <MapPin size={16} />
                                                    <span>{w.name}</span>
                                                    {bookingForm.ward === w.id && <CheckCircle2 size={16} className="check-mark" />}
                                                </button>
                                            ))}
                                            {departments.length === 0 && (
                                                <div className="no-wards-notice">No departments configured. Contact Admin.</div>
                                            )}
                                        </div>
                                        <div className="booking-modal-footer">
                                            <button type="button" className="secondary-btn" onClick={closeBookingModal}>Cancel</button>
                                            <button
                                                type="button"
                                                className="primary-btn flex-btn"
                                                disabled={!bookingForm.ward}
                                                onClick={() => setBookingStep(2)}
                                            >
                                                Next: Date & Time <ChevronRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ── Step 2: Date & Time ── */}
                                {bookingStep === 2 && (
                                    <div className="booking-step fade-in">
                                        <div className="booking-step-title">
                                            <span className="step-num">2</span> Select Date & Time
                                        </div>
                                        <div className="selected-ward-badge">
                                            <MapPin size={14} />
                                            {departments.find(d => d.id === bookingForm.ward)?.name}
                                            <button type="button" className="change-ward-link" onClick={() => setBookingStep(1)}>Change</button>
                                        </div>

                                        <div className="booking-dt-row">
                                            <div className="booking-field">
                                                <label className="booking-label"><Calendar size={14} /> Appointment Date</label>
                                                <input
                                                    type="date" required min={today}
                                                    value={bookingForm.date}
                                                    onChange={e => setBookingForm(prev => ({ ...prev, date: e.target.value }))}
                                                />
                                            </div>
                                            <div className="booking-field">
                                                <label className="booking-label"><Clock size={14} /> Preferred Time</label>
                                                <input
                                                    type="time" required
                                                    value={bookingForm.time}
                                                    onChange={e => setBookingForm(prev => ({ ...prev, time: e.target.value }))}
                                                />
                                            </div>
                                        </div>

                                        <div className="booking-field" style={{ marginTop: '1rem' }}>
                                            <label className="booking-label"><AlertCircle size={14} /> Priority</label>
                                            <div className="priority-group">
                                                {['Normal', 'Urgent', 'Emergency'].map(p => (
                                                    <button
                                                        key={p} type="button"
                                                        className={`priority-btn ${bookingForm.priority === p ? 'selected ' + p.toLowerCase() : ''}`}
                                                        onClick={() => setBookingForm(prev => ({ ...prev, priority: p }))}
                                                    >{p}</button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="booking-field" style={{ marginTop: '1rem' }}>
                                            <label className="booking-label">Reason for Visit</label>
                                            <textarea
                                                rows={2}
                                                placeholder="Brief description of complaints..."
                                                value={bookingForm.reason}
                                                onChange={e => setBookingForm(prev => ({ ...prev, reason: e.target.value }))}
                                            />
                                        </div>

                                        {appointmentFee > 0 && (
                                            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '0.6rem 0.9rem', fontSize: '0.83rem', marginTop: '0.75rem' }}>
                                                💳 Consultation fee: <strong style={{ color: '#059669' }}>₦{appointmentFee.toLocaleString()}</strong> — payable at Billing Office before doctor sees patient.
                                            </div>
                                        )}

                                        <div className="booking-modal-footer">
                                            <button type="button" className="secondary-btn" onClick={() => setBookingStep(1)}>← Back</button>
                                            <button type="submit" className="primary-btn">
                                                Confirm Booking
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Patients;
