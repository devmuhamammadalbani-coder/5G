import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
    Scan, Search, Clock, CheckCircle2,
    AlertTriangle, Folder, User, ChevronRight,
    X, Plus, FileText, Calendar, MapPin, Stethoscope,
    Image as ImageIcon, Camera, UserCircle2, Activity
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

const Radiology = () => {
    const { user, users } = useAuth();
    const {
        imagingOrders, updateImagingOrder, addProgressNote,
        notes, addNote, bookAppointment, patients, loading
    } = useData();

    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'completed'
    const [serviceFilter, setServiceFilter] = useState('All'); // 'All' | 'Radiography' | 'Phlebotomy'
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [resultsDraft, setResultsDraft] = useState('');
    const [selectedImage, setSelectedImage] = useState(null);
    const [showFolder, setShowFolder] = useState(false);
    const [showFollowUp, setShowFollowUp] = useState(false);
    const [assignedService, setAssignedService] = useState(''); // 'Radiographer' | 'Phlebotomist'

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
        const base = imagingOrders.filter(o => {
            const matchesSearch = (o.patientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                 (o.patientId || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesService = serviceFilter === 'All' || o.assignedService === serviceFilter;
            return matchesSearch && matchesService;
        }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        if (activeTab === 'pending') return base.filter(o => o.status === 'Pending' || o.status === 'Processing');
        return base.filter(o => o.status === 'Completed');
    }, [imagingOrders, searchTerm, activeTab, serviceFilter]);

    const openOrder = (order) => {
        setSelectedOrder(order);
        setResultsDraft(order.results || '');
        setAssignedService(order.assignedService || '');
        setSelectedImage(order.imageUrl || null);
        setShowFolder(false);
        setShowFollowUp(false);

        if (order.status === 'Pending') {
            updateImagingOrder(order.id, { status: 'Processing' });
        }

        auditLogger.log(user, 'READ', 'IMAGING_ORDER', order.patientId, `Opened radiology order for ${order.patientName}`);
    };

    const handleApplyTemplate = (type) => {
        const templates = {
            Radiographer: `RADIOLOGY TECHNICAL CAPTURE\n---------------------------\nCapture Quality: [Excellent/Good]\nViews Taken: [AP/Lateral]\nPositioning: [Standard]\nTechnical Findings: \nImpression: \n\nRadiographer Signature: `,
            Phlebotomist: `CONTRAST PREP & VASCULAR ACCESS\n---------------------------\nIV Access Site: [L/R Antecubital]\nCannula Gauge: [18G/20G]\nContrast Agent: [Omnipaque/Visipaque]\nVolume Injected (ml): \nPatient Reaction: [None/Mild/Severe]\nPrep Status: [READY FOR SCANNING]\n\nPhlebotomist Signature: `
        };
        setResultsDraft(templates[type]);
        setAssignedService(type);
        updateImagingOrder(selectedOrder.id, { assignedService: type });
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSelectedImage(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const patientDetail = useMemo(() => {
        if (!selectedOrder) return null;
        return patients.find(p => p.id === selectedOrder.patientId || (p.patientID && p.patientID === selectedOrder.patientId));
    }, [patients, selectedOrder]);

    const handleCompleteTest = (e) => {
        e.preventDefault();

        if (!resultsDraft.trim()) return;

        // INSTANT UI RESPONSE
        const patientName = selectedOrder.patientName;
        setSelectedOrder(null);
        alert(`Radiology results for ${patientName} signed and submitted!`);

        // Background persistence
        try {
            updateImagingOrder(selectedOrder.id, {
                status: 'Completed',
                results: resultsDraft,
                imageUrl: selectedImage, // Attaching the visual scan
                assignedService: assignedService,
                completedBy: user.name,
                completedAt: new Date().toISOString(),
                reviewed: false
            });

            // Save to Clinical Notes
            addNote({
                patientId: selectedOrder.patientId,
                provider: user.name,
                role: 'Radiology',
                type: 'Imaging Report',
                content: `RADIOLOGY REPORT: ${selectedOrder.imagingTests}\nFindings: ${resultsDraft}`,
                imageUrl: selectedImage,
                signature: `Radiologist ${user.name}`,
                signedAt: new Date().toISOString(),
                imagingOrderId: selectedOrder.id,
                appointmentId: selectedOrder.appointmentId 
            });

            // ALSO save to the Continuous Progress Sheet
            addProgressNote({
                patientId: selectedOrder.patientId,
                patientName: selectedOrder.patientName,
                appointmentId: selectedOrder.appointmentId,
                provider: user.name,
                role: 'Radiology',
                type: 'IMAGING_RESULTS',
                text: `RADIOLOGY RESULTS: ${selectedOrder.imagingTests}\nFindings: ${resultsDraft}`,
                imageUrl: selectedImage,
                timestamp: Date.now()
            });

            auditLogger.log(user, 'WRITE', 'RADIOLOGY_RESULTS', selectedOrder.patientId, `Signed imaging results for ${selectedOrder.patientName}`);
        } catch (err) {
            console.error("Radiology background Error:", err);
        }
    };

    const handleFollowUpBook = async (e) => {
        e.preventDefault();
        const docRecord = users.find(u => u.id === followUp.doctorId);
        const wardLabel = WARDS.find(w => w.id === followUp.ward)?.label || followUp.ward;

        try {
            await bookAppointment({
                ...followUp,
                ward: wardLabel,
                wardId: followUp.ward,
                doctorId: followUp.doctorId,
                patientId: selectedOrder.patientId,
                patientName: selectedOrder.patientName,
                doctorName: docRecord ? `Dr. ${docRecord.name}` : 'Unassigned',
                status: 'Scheduled',
            });

            auditLogger.log(user, 'WRITE', 'APPOINTMENT', selectedOrder.patientId, `Radiology-referred follow-up booked at ${wardLabel} with ${docRecord?.name}`);
            setShowFollowUp(false);
            alert(`Follow-up appointment booked for ${selectedOrder?.patientName}`);
        } catch (err) {
            console.error('Radiology follow-up error:', err);
            alert(`Error: ${err.message}`);
        }
    };

    const patientNotes = useMemo(() => {
        if (!selectedOrder || !selectedOrder.patientId) return [];
        // Strict filtering to prevent data leaks and duplication
        return notes.filter(n => 
            n.patientId && 
            n.patientId === selectedOrder.patientId &&
            n.patientId !== 'undefined'
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
        return <Preloader message="Connecting to Imaging Systems..." />;
    }

    return (
        <div className="page-container laboratory-page">
            <div className="page-header-flex">
                <div>
                    <h2>Radiology & Medical Imaging</h2>
                    <p>Digital Imaging Reports & Diagnosis.</p>
                </div>
                <div className="lab-banner" style={{background: '#fee2e2', color: '#991b1b'}}>
                    <Scan size={20} />
                    <span>Radiologist Logged In: <strong>{user.name}</strong></span>
                </div>
            </div>

            <div className="lab-controls">
                <div className="profile-tabs">
                    <button className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
                        <Clock size={16} /> Pending Scans ({imagingOrders.filter(o => o.status === 'Pending' || o.status === 'Processing').length})
                    </button>
                    <button className={`tab-btn ${activeTab === 'completed' ? 'active' : ''}`} onClick={() => setActiveTab('completed')}>
                        <CheckCircle2 size={16} /> Completed Reports
                    </button>
                </div>

                <div className="search-input-wrapper margin-top" style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ position: 'relative', flex: 2 }}>
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search scans by patient name or ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                        />
                    </div>
                    <select 
                        className="filter-select-sm" 
                        style={{ flex: 1, padding: '0 1rem', borderRadius: '8px', border: '1px solid #ddd' }}
                        value={serviceFilter}
                        onChange={(e) => setServiceFilter(e.target.value)}
                    >
                        <option value="All">All Services</option>
                        <option value="Radiographer">Capture/Scanning</option>
                        <option value="Phlebotomist">Phlebotomy/Contrast Prep</option>
                    </select>
                </div>
            </div>

            <div className="lab-grid margin-top">
                <div className="lab-section">
                    <div className="lab-section-title">
                        {activeTab === 'pending' ? <Clock size={16} /> : <CheckCircle2 size={16} />}
                        {activeTab === 'pending' ? 'Imaging Queue' : 'Processed Reports'}
                    </div>

                    <div className="lab-queue-list">
                        {filteredOrders.length === 0 ? (
                            <div className="empty-state">
                                <Scan size={48} />
                                <p>No {activeTab} scans found.</p>
                            </div>
                        ) : (
                            filteredOrders.map(order => (
                                <div key={order.id} className={`lab-queue-card ${selectedOrder?.id === order.id ? 'active' : ''}`} onClick={() => openOrder(order)}>
                                    <div className="lab-card-top">
                                        <div className="lab-patient-info">
                                            <span className="lab-patient-name">{order.patientName}</span>
                                            <span className="small-text">{order.patientId} &bull; Ordered by Dr. {order.doctorName}</span>
                                        </div>
                                    </div>
                                    <div className="lab-tests-box">
                                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                            <strong>Imaging: {order.imagingTests}</strong>
                                            {order.assignedService && (
                                                <span className="badge" style={{fontSize: '0.65rem', background: '#fef2f2', color: '#991b1b'}}>
                                                    {order.assignedService}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="lab-actions">
                                        <span className="small-text">{order.createdAt ? (order.createdAt.toDate ? order.createdAt.toDate().toLocaleString() : new Date(order.createdAt).toLocaleString()) : 'Pending'}</span>
                                        <button className="text-action-link">
                                            {activeTab === 'pending' ? 'Process Order' : 'View Report'} <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="lab-section order-details-panel">
                    {selectedOrder ? (
                        <div className="order-details">
                            <div className="od-header">
                                <h3>{activeTab === 'pending' ? 'Process Imaging Order' : 'Imaging Report'}</h3>
                                <div className="id-tag">{selectedOrder.id}</div>
                            </div>

                            <div className="od-body">
                                <div className="od-patient-card">
                                    <div className="od-patient-avatar-large">
                                        {patientDetail?.gender === 'Female' ? '👩' : '👨'}
                                    </div>
                                    <div className="od-patient-info">
                                        <strong>{selectedOrder.patientName}</strong>
                                        <div className="patient-meta-grid">
                                            <span>Age: <strong>{patientDetail?.age || '—'} yrs</strong></span>
                                            <span>Gender: <strong>{patientDetail?.gender || '—'}</strong></span>
                                            <span>B.Group: <strong>{patientDetail?.bloodGroup || '—'}</strong></span>
                                        </div>
                                        <div className="small-text">Address: {patientDetail?.address || 'N/A'}</div>
                                    </div>
                                    <button className="secondary-btn btn-sm" onClick={() => setShowFolder(!showFolder)}>
                                        <Folder size={14} /> {showFolder ? 'Hide Folder' : 'View History'}
                                    </button>
                                </div>

                                {showFolder && (
                                    <div className="lab-patient-folder-preview fade-in">
                                        <h4>Clinical History</h4>
                                        <div className="history-preview-scroll">
                                            {patientNotes.map(n => (
                                                <div key={n.id} className="history-item-mini">
                                                    <div className="hi-meta">
                                                        <strong>{n.provider}</strong> &bull; {n.timestamp ? new Date(n.timestamp).toLocaleDateString() : (n.signedAt ? new Date(n.signedAt).toLocaleDateString() : 'Unknown')}
                                                    </div>
                                                    <div className="hi-content">{n.diagnosis || n.content}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="od-tests-display">
                                    <label>Imaging Required:</label>
                                    <div className="tests-list-pill" style={{background: '#fee2e2', color: '#991b1b'}}>{selectedOrder.imagingTests}</div>
                                </div>

                                {activeTab === 'pending' && (
                                    <div className="service-assignment-box" style={{background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #e2e8f0'}}>
                                        <label style={{fontSize: '0.8rem', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '0.5rem'}}>
                                            <User size={14} /> ASSIGN SERVICE PATH & LOAD TEMPLATE:
                                        </label>
                                        <div style={{display: 'flex', gap: '0.5rem'}}>
                                            <button 
                                                type="button" 
                                                className={`tab-btn btn-sm ${assignedService === 'Phlebotomist' ? 'active' : ''}`}
                                                onClick={() => handleApplyTemplate('Phlebotomist')}
                                                style={{flex: 1, justifyContent: 'center'}}
                                            >
                                                Phlebotomy Prep
                                            </button>
                                            <button 
                                                type="button" 
                                                className={`tab-btn btn-sm ${assignedService === 'Radiographer' ? 'active' : ''}`}
                                                onClick={() => handleApplyTemplate('Radiographer')}
                                                style={{flex: 1, justifyContent: 'center'}}
                                            >
                                                Radiology Capture
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'pending' ? (
                                    <form onSubmit={handleCompleteTest} className="lab-results-form">
                                        <div className="imaging-upload-area">
                                            <label className="upload-label">
                                                <Camera size={20} /> Upload Digital Scan/Image
                                                <input type="file" accept="image/*" onChange={handleImageChange} hidden />
                                            </label>
                                            
                                            {selectedImage ? (
                                                <div className="scan-preview">
                                                    <img src={selectedImage} alt="Radiology Scan" />
                                                    <button type="button" className="remove-img" onClick={() => setSelectedImage(null)}><X size={14} /></button>
                                                </div>
                                            ) : (
                                                <div className="upload-placeholder">
                                                    <ImageIcon size={40} />
                                                    <p>Click camera icon to upload X-Ray or Scan image</p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="form-group">
                                            <label>Radiological Findings & Conclusion:</label>
                                            <textarea
                                                className="lab-results-input"
                                                rows={10}
                                                placeholder="Enter detailed radiological findings, impression, and conclusion..."
                                                value={resultsDraft}
                                                onChange={(e) => setResultsDraft(e.target.value)}
                                                required
                                            />
                                        </div>

                                        <div className="lab-form-footer">
                                            <button type="button" className="followup-trigger" onClick={() => setShowFollowUp(true)}>
                                                <Plus size={16} /> Clinical Referral
                                            </button>
                                            <button type="submit" className="primary-btn" style={{background: '#991b1b'}} disabled={!resultsDraft.trim()}>
                                                <Scan size={16} /> Sign & Finalize Report
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="completed-results-view">
                                        {selectedOrder.imageUrl && (
                                            <div className="final-scan-display" onClick={() => window.open(selectedOrder.imageUrl)}>
                                                <img src={selectedOrder.imageUrl} alt="Clinical Scan" />
                                                <div className="scan-overlay"><Eye size={16} /> Click to enlarge</div>
                                            </div>
                                        )}
                                        <div className="results-content">
                                            <label>Final Imaging Report:</label>
                                            <p className="results-text" style={{whiteSpace: 'pre-wrap'}}>{selectedOrder.results}</p>
                                        </div>
                                        <div className="results-footer">
                                            <div className="signed-stamp">
                                                <CheckCircle2 size={14} /> Signed by: Radiologist {selectedOrder.completedBy}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {showFollowUp && (
                                    <div className="followup-modal-inline fade-in">
                                        <div className="followup-header">
                                            <h4><Calendar size={16} /> Radiology Follow-Up Appointment</h4>
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
                                            <button type="submit" className="primary-btn full-btn" style={{background: '#991b1b'}}>Book Referral</button>
                                        </form>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state highlight shadow-sm">
                            <Scan size={64} style={{color: '#991b1b'}} />
                            <h3>Radiology Command Center</h3>
                            <p>Select a pending scan to write and finalize the radiological report.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Radiology;
