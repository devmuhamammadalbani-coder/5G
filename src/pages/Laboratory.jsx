import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
    FlaskConical, Search, Clock, CheckCircle2,
    AlertTriangle, Folder, User, ChevronRight,
    X, Plus, FileText, Calendar, MapPin, Stethoscope
} from 'lucide-react';
import auditLogger from '../utils/auditLogger';
import Preloader from '../components/common/Preloader';

const WARDS = [
    { id: 'GOPD', label: 'General Outpatient (GOPD)' },
    { id: 'Pediatrics', label: 'Pediatrics Ward' },
    { id: 'OBG', label: 'Obstetrics & Gynecology' },
    { id: 'Surgical', label: 'Surgical Ward' },
    { id: 'ICU', label: 'Intensive Care Unit (ICU)' },
    { id: 'Orthopedic', label: 'Orthopedic Ward' },
    { id: 'Cardiology', label: 'Cardiology Unit' },
    { id: 'ENT', label: 'ENT Clinic' },
];

const TEST_TEMPLATES = {
    'Malaria': {
        parasiteDensity: '',
        species: 'P. falciparum',
        comment: ''
    },
    'PCV': {
        value: '',
        unit: '%',
        referenceRange: '37-54%'
    },
    'Blood Group': {
        group: '',
        genotype: '',
        rhesus: 'Positive'
    },
    'Urinalysis': {
        glucose: 'Negative',
        protein: 'Negative',
        nitrite: 'Negative',
        leukocytes: 'Negative'
    }
};

const Laboratory = () => {
    const { user, users } = useAuth();
    const {
        labOrders, updateLabOrder, addProgressNote,
        notes, addNote, bookAppointment, loading
    } = useData();

    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'completed'
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [resultsDraft, setResultsDraft] = useState('');
    const [showFolder, setShowFolder] = useState(false);
    const [showFollowUp, setShowFollowUp] = useState(false);
    const [activeTemplate, setActiveTemplate] = useState(null);

    // Follow-up form state
    const [followUp, setFollowUp] = useState({
        ward: '',
        doctorId: '',
        date: '',
        time: '',
        reason: '',
        priority: 'Normal'
    });

    const filteredOrders = useMemo(() => {
        const base = labOrders.filter(o =>
            (o.patientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (o.patientId || '').toLowerCase().includes(searchTerm.toLowerCase())
        ).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        if (activeTab === 'pending') return base.filter(o => o.status === 'Pending' || o.status === 'Processing');
        return base.filter(o => o.status === 'Completed');
    }, [labOrders, searchTerm, activeTab]);

    const openOrder = (order) => {
        setSelectedOrder(order);
        setResultsDraft('');
        setShowFolder(false);
        setShowFollowUp(false);
        setActiveTemplate(null);

        // Auto-detect template
        const lowerTests = order.labTests.toLowerCase();
        if (lowerTests.includes('malaria')) setActiveTemplate('Malaria');
        else if (lowerTests.includes('pcv')) setActiveTemplate('PCV');
        else if (lowerTests.includes('blood group') || lowerTests.includes('genotype')) setActiveTemplate('Blood Group');
        else if (lowerTests.includes('urinalysis')) setActiveTemplate('Urinalysis');

        if (order.status === 'Pending') {
            updateLabOrder(order.id, { status: 'Processing' });
        }

        auditLogger.log(user, 'READ', 'LAB_ORDER', order.patientId, `Opened lab order for ${order.patientName}`);
    };

    const handleCompleteTest = (e) => {
        e.preventDefault();

        let finalResults = resultsDraft;
        if (activeTemplate) {
            finalResults = `[${activeTemplate} Report] ${resultsDraft}`;
        }
        if (!finalResults.trim()) return;

        // INSTANT UI RESPONSE
        const patientName = selectedOrder.patientName;
        setSelectedOrder(null);
        alert(`Results for ${patientName} signed and submitted instantly!`);

        // Background persistence
        try {
            updateLabOrder(selectedOrder.id, {
                status: 'Completed',
                results: finalResults,
                completedBy: user.name,
                completedAt: new Date().toISOString(),
                reviewed: false
            });

            addNote({
                patientId: selectedOrder.patientId,
                provider: user.name,
                role: 'Laboratory',
                type: 'Diagnostic Report',
                content: `LAB REPORT: ${selectedOrder.labTests}\nResults: ${finalResults}`,
                signature: `Lab Scientist ${user.name}`,
                signedAt: new Date().toISOString(),
                labOrderId: selectedOrder.id,
                appointmentId: selectedOrder.appointmentId // Linked back to doctor's visit
            });

            // ALSO save to the Continuous Progress Sheet
            addProgressNote({
                patientId: selectedOrder.patientId,
                patientName: selectedOrder.patientName,
                appointmentId: selectedOrder.appointmentId,
                provider: user.name,
                role: 'Laboratory',
                type: 'DIAGNOSTIC_RESULTS',
                text: `LAB RESULTS: ${selectedOrder.labTests}\n${finalResults}`,
                timestamp: Date.now()
            });

            auditLogger.log(user, 'WRITE', 'LAB_RESULTS', selectedOrder.patientId, `Signed results for ${selectedOrder.patientName}`);
        } catch (err) {
            console.error("Lab background Error:", err);
        }
    };

    const updateField = (label, value, suffix = '') => {
        setResultsDraft(r => {
            const prev = r || '';
            const regex = new RegExp(`${label}: [^;]*`);
            const newValue = `${label}: ${value}${suffix}`;
            if (prev.includes(`${label}:`)) {
                return prev.replace(regex, newValue);
            } else {
                return prev ? `${prev}; ${newValue}` : newValue;
            }
        });
    };

    const handleFollowUpBook = async (e) => {
        e.preventDefault();
        const docRecord = users.find(u => u.id === followUp.doctorId);
        const wardLabel = WARDS.find(w => w.id === followUp.ward)?.label || followUp.ward;

        try {
            await bookAppointment({
                ...followUp,
                ward: wardLabel,           // String for display
                wardId: followUp.ward,     // ID for logic
                doctorId: followUp.doctorId, // Critical for routing
                patientId: selectedOrder.patientId,
                patientName: selectedOrder.patientName,
                doctorName: docRecord ? `Dr. ${docRecord.name}` : 'Unassigned',
                status: 'Scheduled',
            });

            auditLogger.log(user, 'WRITE', 'APPOINTMENT', selectedOrder.patientId, `Lab-referred follow-up booked at ${wardLabel} with ${docRecord?.name}`);
            setShowFollowUp(false);
            alert(`Follow-up appointment booked for ${selectedOrder?.patientName}`);
        } catch (err) {
            console.error('Lab follow-up error:', err);
            alert(`Error: ${err.message}`);
        }
    };

    const patientNotes = useMemo(() => {
        if (!selectedOrder || !selectedOrder.patientId) return [];
        // Strict filtering to prevent data leaks and duplication
        return notes.filter(n => 
            n.patientId && 
            n.patientId === selectedOrder.patientId &&
            n.patientId !== 'undefined' // Guard against stringified undefined
        ).sort((a, b) => {
            const getD = (x) => (x?.toDate ? x.toDate() : (x ? new Date(x) : new Date(0)));
            const dA = getD(a.createdAt || a.signedAt || a.timestamp);
            const dB = getD(b.createdAt || b.signedAt || b.timestamp);
            return dB - dA;
        });
    }, [notes, selectedOrder]);

    const authDoctors = useMemo(() => users.filter(u => u.role === 'Doctor' && u.isActive), [users]);
    const followUpDoctors = useMemo(() => {
        if (!followUp.ward) return [];
        const byWard = authDoctors.filter(d => d.specialty === followUp.ward);
        return byWard.length ? byWard : authDoctors;
    }, [authDoctors, followUp.ward]);

    const today = new Date().toISOString().split('T')[0];

    if (loading) {
        return <Preloader message="Synchronizing Lab Queue..." />;
    }

    return (
        <div className="page-container laboratory-page">
            <div className="page-header-flex">
                <div>
                    <h2>Laboratory Information System</h2>
                    <p>Diagnostic & Results Management.</p>
                </div>
                <div className="lab-banner">
                    <FlaskConical size={20} />
                    <span>Lab Tech Logged In: <strong>{user.name}</strong></span>
                </div>
            </div>

            <div className="lab-controls">
                <div className="profile-tabs">
                    <button className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
                        <Clock size={16} /> Unprocessed Orders ({labOrders.filter(o => o.status === 'Pending' || o.status === 'Processing').length})
                    </button>
                    <button className={`tab-btn ${activeTab === 'completed' ? 'active' : ''}`} onClick={() => setActiveTab('completed')}>
                        <CheckCircle2 size={16} /> Processed Results
                    </button>
                </div>

                <div className="search-input-wrapper margin-top">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search orders by patient name or ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>
            </div>

            <div className="lab-grid margin-top">
                <div className="lab-section">
                    <div className="lab-section-title">
                        {activeTab === 'pending' ? <Clock size={16} /> : <CheckCircle2 size={16} />}
                        {activeTab === 'pending' ? 'Unprocessed Queue' : 'Processed Results'}
                    </div>

                    <div className="lab-queue-list">
                        {filteredOrders.length === 0 ? (
                            <div className="empty-state">
                                <FlaskConical size={48} />
                                <p>No {activeTab} orders found.</p>
                            </div>
                        ) : (
                            filteredOrders.map(order => (
                                <div key={order.id} className={`lab-queue-card ${selectedOrder?.id === order.id ? 'active' : ''}`} onClick={() => openOrder(order)}>
                                    <div className="lab-card-top">
                                        <div className="lab-patient-info">
                                            <span className="lab-patient-name">{order.patientName}</span>
                                            <span className="small-text">{order.patientId} &bull; Ordered by Dr. {order.doctorName}</span>
                                        </div>
                                        {order.priority === 'Emergency' && <span className="urgent-badge">EMERGENCY</span>}
                                    </div>
                                    <div className="lab-tests-box">
                                        <strong>Tests:</strong> {order.labTests}
                                    </div>
                                    <div className="lab-actions">
                                        <span className="small-text">{order.createdAt ? (order.createdAt.toDate ? order.createdAt.toDate().toLocaleString() : new Date(order.createdAt).toLocaleString()) : 'Pending'}</span>
                                        <button className="text-action-link">
                                            {activeTab === 'pending' ? 'Process Order' : 'View Processed Results'} <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Processing Panel */}
                <div className="lab-section order-details-panel">
                    {selectedOrder ? (
                        <div className="order-details">
                            <div className="od-header">
                                <h3>{activeTab === 'pending' ? 'Process Order' : 'Test Results'}</h3>
                                <div className="id-tag">{selectedOrder.id}</div>
                            </div>

                            <div className="od-body">
                                <div className="od-patient-card">
                                    <User size={20} />
                                    <div className="od-patient-info">
                                        <strong>{selectedOrder.patientName}</strong>
                                        <div className="small-text">Referral: {selectedOrder.ward} | Dr. {selectedOrder.doctorName}</div>
                                    </div>
                                    <button className="secondary-btn btn-sm" onClick={() => setShowFolder(!showFolder)}>
                                        <Folder size={14} /> {showFolder ? 'Hide Folder' : 'View Folder'}
                                    </button>
                                </div>

                                {showFolder && (
                                    <div className="lab-patient-folder-preview fade-in">
                                        <h4>Clinical History</h4>
                                        <div className="history-preview-scroll">
                                            {patientNotes.length === 0 ? (
                                                <p className="empty-history-text">No clinical notes found for this patient.</p>
                                            ) : (
                                                patientNotes.map(n => (
                                                    <div key={n.id} className="history-item-mini">
                                                        <div className="hi-meta">
                                                            <strong>{n.provider}</strong> &bull; {n.timestamp ? new Date(n.timestamp).toLocaleDateString() : (n.signedAt ? new Date(n.signedAt).toLocaleDateString() : 'Unknown')}
                                                        </div>
                                                        <div className="hi-content">{n.diagnosis || n.content}</div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="od-tests-display">
                                    <label>Ordered Tests:</label>
                                    <div className="tests-list-pill">{selectedOrder.labTests}</div>
                                </div>

                                {activeTab === 'pending' ? (
                                    <form onSubmit={handleCompleteTest} className="lab-results-form">
                                        {/* Doctor's Request Context Panel */}
                                        {selectedOrder.chiefComplaint && (
                                            <div className="doctor-request-context">
                                                <h4><FileText size={14} /> Doctor's Request</h4>
                                                <div className="context-row"><label>Complaint:</label><span>{selectedOrder.chiefComplaint}</span></div>
                                                {selectedOrder.diagnosis && <div className="context-row"><label>Working Dx:</label><span>{selectedOrder.diagnosis}</span></div>}
                                            </div>
                                        )}

                                        <div className="template-selector">
                                            <label>Result Template:</label>
                                            <div className="template-pills">
                                                {Object.keys(TEST_TEMPLATES).map(t => (
                                                    <button key={t} type="button"
                                                        className={`template-pill ${activeTemplate === t ? 'active' : ''}`}
                                                        onClick={() => setActiveTemplate(t)}>
                                                        {t}
                                                    </button>
                                                ))}
                                                <button type="button"
                                                    className={`template-pill ${!activeTemplate ? 'active' : ''}`}
                                                    onClick={() => setActiveTemplate(null)}>
                                                    Free Text
                                                </button>
                                            </div>
                                        </div>

                                        {/* Malaria Template */}
                                        {activeTemplate === 'Malaria' && (
                                            <div className="result-template-fields fade-in">
                                                <h5>🔬 Malaria Parasite Test</h5>
                                                <div className="template-grid">
                                                    <div className="form-group"><label>Result</label>
                                                        <select onChange={e => updateField('Result', e.target.value)}>
                                                            <option value="">-- Select --</option>
                                                            <option>Negative</option>
                                                            <option>Positive</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group"><label>Species</label>
                                                        <select onChange={e => updateField('Species', e.target.value)}>
                                                            <option value="">-- Select --</option>
                                                            <option>P. falciparum</option>
                                                            <option>P. vivax</option>
                                                            <option>P. malariae</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group"><label>Parasite Density (per µL)</label>
                                                        <input type="text" placeholder="e.g. 2000+" onChange={e => updateField('Parasite Density', e.target.value)} />
                                                    </div>
                                                    <div className="form-group"><label>Additional Comments</label>
                                                        <textarea rows={2} placeholder="Clinical remarks..." onChange={e => updateField('Comment', e.target.value)} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* PCV Template */}
                                        {activeTemplate === 'PCV' && (
                                            <div className="result-template-fields fade-in">
                                                <h5>🩸 Full Blood Count</h5>
                                                <div className="template-grid">
                                                    <div className="form-group"><label>PCV (%)</label><input type="number" placeholder="Normal: 37-54%" onChange={e => updateField('PCV', e.target.value, '%')} /></div>
                                                    <div className="form-group"><label>Haemoglobin (g/dL)</label><input type="number" placeholder="e.g. 12.5" onChange={e => updateField('Hb', e.target.value, 'g/dL')} /></div>
                                                    <div className="form-group"><label>WBC (×10⁹/L)</label><input type="number" placeholder="Normal: 4-11" onChange={e => updateField('WBC', e.target.value)} /></div>
                                                    <div className="form-group"><label>Platelets (×10⁹/L)</label><input type="number" placeholder="Normal: 150-400" onChange={e => updateField('Platelets', e.target.value)} /></div>
                                                    <div className="form-group"><label>Report Impression</label><textarea rows={2} placeholder="Adequate/Low/High..." onChange={e => updateField('Impression', e.target.value)} /></div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Blood Group Template */}
                                        {activeTemplate === 'Blood Group' && (
                                            <div className="result-template-fields fade-in">
                                                <h5>🅰 Blood Grouping & Genotyping</h5>
                                                <div className="template-grid">
                                                    <div className="form-group"><label>Blood Group</label>
                                                        <select onChange={e => updateField('Blood Group', e.target.value)}>
                                                            <option value="">-- Select --</option>
                                                            {['A', 'B', 'AB', 'O'].map(g => <option key={g}>{g}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="form-group"><label>Rhesus Factor</label>
                                                        <select onChange={e => updateField('Rhesus', e.target.value)}>
                                                            <option value="">-- Select --</option>
                                                            <option>Positive (+)</option>
                                                            <option>Negative (-)</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group"><label>Genotype</label>
                                                        <select onChange={e => updateField('Genotype', e.target.value)}>
                                                            <option value="">-- Select --</option>
                                                            {['AA', 'AS', 'SS', 'AC', 'SC'].map(g => <option key={g}>{g}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Urinalysis Template */}
                                        {activeTemplate === 'Urinalysis' && (
                                            <div className="result-template-fields fade-in">
                                                <h5>🧪 Urinalysis Report</h5>
                                                <div className="template-grid">
                                                    {[
                                                        { label: 'Glucose', key: 'glucose' },
                                                        { label: 'Protein', key: 'protein' },
                                                        { label: 'Nitrite', key: 'nitrite' },
                                                        { label: 'Leukocytes', key: 'leukocytes' },
                                                        { label: 'Blood', key: 'blood' },
                                                        { label: 'Ketones', key: 'ketones' },
                                                    ].map(({ label, key }) => (
                                                        <div className="form-group" key={key}>
                                                            <label>{label}</label>
                                                            <select onChange={e => updateField(label, e.target.value)}>
                                                                <option value="">-- Select --</option>
                                                                <option>Negative</option>
                                                                <option>Trace</option>
                                                                <option>+</option>
                                                                <option>++</option>
                                                                <option>+++</option>
                                                            </select>
                                                        </div>
                                                    ))}
                                                    <div className="form-group"><label>Colour</label><input type="text" placeholder="e.g. Pale Yellow" onChange={e => updateField('Colour', e.target.value)} /></div>
                                                    <div className="form-group"><label>Appearance</label><input type="text" placeholder="e.g. Clear/Turbid" onChange={e => updateField('Appearance', e.target.value)} /></div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Free text fallback */}
                                        {!activeTemplate && (
                                            <div className="form-group">
                                                <label>Result / Observations:</label>
                                                <textarea
                                                    className="lab-results-input"
                                                    rows={6}
                                                    placeholder="Enter detailed lab findings, values, and interpretations..."
                                                    value={resultsDraft}
                                                    onChange={(e) => setResultsDraft(e.target.value)}
                                                    required
                                                />
                                            </div>
                                        )}

                                        <div className="lab-form-footer">
                                            <button type="button" className="followup-trigger" onClick={() => setShowFollowUp(true)}>
                                                <Plus size={16} /> Book Doctor Follow-Up
                                            </button>
                                            <button type="submit" className="primary-btn" disabled={!resultsDraft.trim()}>
                                                <CheckCircle2 size={16} /> Sign & Submit Results
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="completed-results-view">
                                        <div className="results-content">
                                            <label>Reported Results:</label>
                                            <p className="results-text">{selectedOrder.results}</p>
                                        </div>
                                        <div className="results-footer">
                                            <div className="signed-stamp">
                                                <CheckCircle2 size={14} /> Signed by: {selectedOrder.completedBy}
                                                <div className="small-text">{selectedOrder.completedAt ? (selectedOrder.completedAt.toDate ? selectedOrder.completedAt.toDate().toLocaleString() : new Date(selectedOrder.completedAt).toLocaleString()) : 'Just now'}</div>
                                            </div>
                                            <button className="followup-trigger" onClick={() => setShowFollowUp(true)}>
                                                <Plus size={16} /> Book Follow-Up
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {showFollowUp && (
                                    <div className="followup-modal-inline fade-in">
                                        <div className="followup-header">
                                            <h4><Calendar size={16} /> Book Clinical Follow-Up</h4>
                                            <button onClick={() => setShowFollowUp(false)}><X size={16} /></button>
                                        </div>
                                        <form onSubmit={handleFollowUpBook} className="followup-inline-form">
                                            <div className="form-group">
                                                <label>Ward / Specialty</label>
                                                <select
                                                    value={followUp.ward}
                                                    onChange={e => setFollowUp(p => ({ ...p, ward: e.target.value, doctorId: '' }))}
                                                    required
                                                >
                                                    <option value="">-- Select Ward --</option>
                                                    {WARDS.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label>Doctor</label>
                                                <select
                                                    value={followUp.doctorId}
                                                    onChange={e => setFollowUp(p => ({ ...p, doctorId: e.target.value }))}
                                                    required
                                                >
                                                    <option value="">-- Select Doctor --</option>
                                                    {followUpDoctors.map(d => <option key={d.id} value={d.id}>Dr. {d.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label>Date</label>
                                                    <input type="date" min={today} value={followUp.date} onChange={e => setFollowUp(p => ({ ...p, date: e.target.value }))} required />
                                                </div>
                                                <div className="form-group">
                                                    <label>Time</label>
                                                    <input type="time" value={followUp.time} onChange={e => setFollowUp(p => ({ ...p, time: e.target.value }))} required />
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label>Reason</label>
                                                <input type="text" placeholder="Lab follow-up reason..." value={followUp.reason} onChange={e => setFollowUp(p => ({ ...p, reason: e.target.value }))} />
                                            </div>
                                            <button type="submit" className="primary-btn full-btn">Confirm Clinical Referral</button>
                                        </form>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state highlight">
                            <FlaskConical size={64} />
                            <h3>Laboratory Command Center</h3>
                            <p>Select an order from the queue to start processing diagnostic tests.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Laboratory;
