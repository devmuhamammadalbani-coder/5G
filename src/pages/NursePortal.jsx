import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
    Users, Activity, ClipboardList, PenLine, ShieldCheck,
    Heart, Thermometer, FileText, CheckCircle2, Eye, MapPin,
    Clock, BedDouble, AlertCircle, LogOut
} from 'lucide-react';
import auditLogger from '../utils/auditLogger';
import Preloader from '../components/common/Preloader';

const NursePortal = () => {
    const { user, users } = useAuth();
    const {
        admissions, patients, notes, addNote, addProgressNote,
        progressNotes, loading, finalizeDischarge, addNotification,
        appointments, sendToDoctor
    } = useData();

    const [activeTab, setActiveTab] = useState('outpatient'); // default to outpatient
    const [activeAdmission, setActiveAdmission] = useState(null);
    const [activeAppt, setActiveAppt] = useState(null);
    const [activePatient, setActivePatient] = useState(null);
    const [targetDoctorId, setTargetDoctorId] = useState('');

    // Form matching Doctor's Clinical Encounter Record
    const [clinicalForm, setClinicalForm] = useState({
        chiefComplaint: '',
        vitalSigns: { bp: '', temp: '', pulse: '', resp: '', spo2: '', weight: '' },
        diagnosis: '', // Read-only for nurse
        prescription: '', // Read-only for nurse
        treatmentPlan: '', // Read-only for nurse
        labOrders: '', // Read-only for nurse
        imagingOrders: '', // Read-only for nurse
        notes: '',
    });
    const [noteSubmitted, setNoteSubmitted] = useState(false);
    const [submittingDischarge, setSubmittingDischarge] = useState(false);

    const nurseWard = user.specialty || '';
    const myAdmissions = useMemo(() => {
        return admissions.filter(a => {
            if (a.status !== 'Active' && a.status !== 'ReadyForRelease') return false;
            if (!nurseWard) return true;
            const targetWard = nurseWard.trim().toLowerCase();
            const admWardId = (a.wardId || '').trim().toLowerCase();
            const admWardName = (a.wardName || '').trim().toLowerCase();
            return admWardId === targetWard || admWardId.includes(targetWard) || 
                   admWardName === targetWard || admWardName.includes(targetWard);
        }).sort((a, b) => {
            if (a.status === 'ReadyForRelease' && b.status !== 'ReadyForRelease') return -1;
            if (a.status !== 'ReadyForRelease' && b.status === 'ReadyForRelease') return 1;
            return 0;
        });
    }, [admissions, nurseWard]);

    // Filter Outpatient queue for patients awaiting vitals
    const opdQueue = useMemo(() => {
        return appointments.filter(a => {
            // Must be awaiting vitals to appear here
            if (a.status !== 'AwaitingVitals') return false;

            // If nurse has no specialty, is an admin, or is a general nurse, show all
            const lowerWard = (nurseWard || '').toLowerCase();
            if (!nurseWard || 
                ['nurse', 'station', 'all', 'general', 'admin', 'triage', 'opd'].some(key => lowerWard.includes(key))
            ) {
                return true;
            }

            const targetWard = nurseWard.trim().toLowerCase();
            const apptWardId = (a.wardId || '').trim().toLowerCase();
            const apptWardName = (a.ward || '').trim().toLowerCase();

            // Match if appointment ward ID or Name matches nurse's specialty (partial match allowed)
            return apptWardId === targetWard || 
                   apptWardName === targetWard || 
                   apptWardId.includes(targetWard) || 
                   apptWardName.includes(targetWard) ||
                   targetWard.includes(apptWardName);
        }).sort((a, b) => {
            // 1. Emergency first
            const priorityMap = { 'Emergency': 0, 'Urgent': 1, 'Normal': 2 };
            const pa = priorityMap[a.priority] ?? 2;
            const pb = priorityMap[b.priority] ?? 2;
            if (pa !== pb) return pa - pb;
            // 2. Most recently released at Billing comes first (fallback to updated/created)
            const getTimestamp = (appt) => {
                const ts = appt.authorizedAt || appt.updatedAt || appt.createdAt;
                if (!ts) return 0;
                if (ts.toMillis) return ts.toMillis();
                if (ts.seconds) return ts.seconds * 1000;
                return new Date(ts).getTime();
            };

            const timeA = getTimestamp(a);
            const timeB = getTimestamp(b);
            
            if (timeA !== timeB) return timeB - timeA;

            // 3. Fallback to appointment time
            const dateA = a.date ? new Date(a.date + 'T' + (a.time || '00:00')) : new Date(0);
            const dateB = b.date ? new Date(b.date + 'T' + (b.time || '00:00')) : new Date(0);
            return dateA - dateB;
        });
    }, [appointments, nurseWard]);

    // Available doctors in the nurse's ward or the specific ward of the appointment
    const availableDoctors = useMemo(() => {
        const currentWard = activeAppt?.wardId || nurseWard;
        return users.filter(u => 
            u.role === 'Doctor' && 
            u.isActive && 
            (u.specialty === currentWard || u.specialty?.toLowerCase().includes(currentWard.toLowerCase()))
        );
    }, [users, activeAppt, nurseWard]);

    const handleOpenOPD = (appt) => {
        const patient = patients.find(p => p.id === appt.patientId || p.patientID === appt.patientId);
        setActiveAppt(appt);
        setActivePatient(patient);
        setNoteSubmitted(false);
        setTargetDoctorId(''); // reset selection
        setClinicalForm({
            chiefComplaint: appt.reason || '',
            vitalSigns: { bp: '', temp: '', pulse: '', resp: '', spo2: '', weight: '' },
            diagnosis: 'Nurse cannot enter diagnosis.', 
            prescription: 'Nurse cannot enter prescription.', 
            treatmentPlan: 'Nurse cannot enter treatment plan.', 
            labOrders: 'Provider only.', 
            imagingOrders: 'Provider only.',
            notes: ''
        });
        auditLogger.log(user, 'READ', 'OPD_TRIAGE', appt.patientId, `Nurse opened OPD triage for ${patient?.name}`);
    };
    const handleOpenPatient = (admission) => {
        const patient = patients.find(p => p.id === admission.patientId || p.patientID === admission.patientId);

        // Find latest Doctor note for this patient
        const doctorNotes = notes.filter(n =>
            (n.patientId === patient?.id || n.patientId === patient?.patientID) &&
            n.role === 'Doctor'
        ).sort((a, b) => {
            const getD = (x) => (x?.toDate ? x.toDate() : (x ? new Date(x) : new Date(0)));
            return getD(b.createdAt || b.signedAt || b.timestamp) - getD(a.createdAt || a.signedAt || a.timestamp);
        });
        const latestDocNote = doctorNotes[0] || {};

        setActiveAdmission(admission);
        setActiveAppt(null);
        setActivePatient(patient);
        setNoteSubmitted(false);
        setClinicalForm({
            chiefComplaint: '',
            vitalSigns: { bp: '', temp: '', pulse: '', resp: '', spo2: '', weight: '' },
            diagnosis: latestDocNote.diagnosis || 'No Diagnosis recorded yet. Nurse cannot enter diagnosis.',
            prescription: latestDocNote.prescription || 'No Prescriptions. Do not enter new prescriptions.',
            treatmentPlan: latestDocNote.treatmentPlan || 'No Treatment Plan. Provider orders only.',
            labOrders: latestDocNote.labOrders || 'No Lab Orders. Provider orders only.',
            imagingOrders: latestDocNote.imagingOrders || 'No Radiology Orders. Provider orders only.',
            notes: ''
        });
        auditLogger.log(user, 'READ', 'INPATIENT_FOLDER', admission.patientId, `Nurse opened admission record for ${patient?.name}`);
    };

    const handleVitalBlur = (field, unit) => {
        setClinicalForm(p => {
            let val = p.vitalSigns[field].trim();
            if (val && !val.includes(unit)) {
                val = `${val} ${unit}`;
            }
            return { ...p, vitalSigns: { ...p.vitalSigns, [field]: val } };
        });
    };

    const handleSubmitNote = async (e) => {
        e.preventDefault();
        
        if (!clinicalForm.chiefComplaint.trim()) {
            return alert('Please enter the Chief Complaint before saving the note.');
        }

        if (activeTab === 'outpatient' && !targetDoctorId) {
            return alert('Please select a Doctor to forward this patient to.');
        }

        try {
            // 1. Save standard clinical note
            const noteRecord = {
                patientId: activePatient.id || '',
                appointmentId: activeAppt?.id || null,
                provider: user.name || 'Unknown',
                role: 'Nurse',
                ward: activeAdmission ? (activeAdmission.wardName || activeAdmission.roomName) : (activeAppt?.ward || 'OPD'),
                type: activeTab === 'inpatient' ? 'Nursing Assessment' : 'OPD Triage',
                chiefComplaint: clinicalForm.chiefComplaint || '',
                vitalSigns: clinicalForm.vitalSigns || {},
                notes: clinicalForm.notes || '',
                signature: `Nurse ${user.name}`,
                signedAt: new Date().toISOString(),
            };
            await addNote(noteRecord);
            
            // 2. Add to continuous progress sheet
            await addProgressNote({
                patientId: activePatient.id || '',
                patientName: activePatient.name || 'Unknown Patient',
                provider: user.name || 'Unknown',
                role: 'Nurse',
                type: activeTab === 'inpatient' ? 'NURSING OBSERVATION' : 'TRIAGE NOTES',
                duration: 5,
                text: `Chief Complaint: ${clinicalForm.chiefComplaint || 'None'}\nNotes: ${clinicalForm.notes || 'None'}`,
                vitals: clinicalForm.vitalSigns || {},
                timestamp: Date.now()
            });

            // 3. If OPD, send to selected Doctor
            if (activeTab === 'outpatient' && activeAppt) {
                const targetDoc = users.find(u => u.id === targetDoctorId);
                await sendToDoctor(activeAppt.id, clinicalForm.vitalSigns, targetDoctorId, `Dr. ${targetDoc?.name}`);
                auditLogger.log(user, 'WRITE', 'OPD_SEND_TO_DOCTOR', activePatient.id, `Nurse completed vitals and sent ${activePatient.name} to Dr. ${targetDoc?.name}`);
            }

            auditLogger.log(user, 'WRITE', 'NURSING_NOTE', activePatient.id, `Nursing observation filed for ${activePatient.name}`);
            setNoteSubmitted(true);
        } catch (error) {
            console.error("Error saving nursing note:", error);
            alert(`Failed to save note: ${error.message}`);
        }
    };

    const handleFinalizeDischarge = async () => {
        if (!activeAdmission) return;
        if (!window.confirm(`Are you sure you want to finalize the discharge for ${activePatient.name}? This will free Bed ${activeAdmission.bedNumber}.`)) return;

        setSubmittingDischarge(true);
        try {
            await finalizeDischarge(activeAdmission.id);

            // Send notification to Billing
            await addNotification({
                type: 'DISCHARGE_FINALIZED',
                title: '🏁 Patient Physically Discharged',
                message: `${activePatient.name} has physically left the ward. Bed ${activeAdmission.bedNumber} is now vacant.`,
                patientId: activePatient.id,
                patientName: activePatient.name,
                admissionId: activeAdmission.id,
                targetRole: 'Biller',
                priority: 'normal'
            });

            auditLogger.log(user, 'WRITE', 'DISCHARGE_FINALIZE', activePatient.id, `Nurse finalized physical discharge for ${activePatient.name}`);
            alert("Discharge finalized. Bed is now free.");
            setActiveAdmission(null);
            setActivePatient(null);
        } catch (error) {
            console.error("Error finalizing discharge:", error);
            alert("Failed to finalize discharge: " + error.message);
        } finally {
            setSubmittingDischarge(false);
        }
    };

    if (loading) return <Preloader message="Loading Nursing Portal..." />;

    return (
        <div className="page-container" style={{ padding: '2rem' }}>
            <div className="page-header-flex">
                <div>
                    <h2>Nursing Station</h2>
                    <p>Manage Triage, Vitals, and In-Patient Wards</p>
                </div>
                <div className="tabs-pill-container" style={{ display: 'flex', gap: '10px', background: '#f1f5f9', padding: '5px', borderRadius: '10px' }}>
                    <button
                        onClick={() => { setActiveTab('inpatient'); setActiveAdmission(null); }}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: activeTab === 'inpatient' ? 'white' : 'transparent', fontWeight: activeTab === 'inpatient' ? '700' : '500', boxShadow: activeTab === 'inpatient' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer' }}
                    >
                        In-Patient Ward
                    </button>
                    <button
                        onClick={() => { setActiveTab('outpatient'); setActiveAppt(null); setActivePatient(null); }}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: activeTab === 'outpatient' ? 'white' : 'transparent', fontWeight: activeTab === 'outpatient' ? '700' : '500', boxShadow: activeTab === 'outpatient' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer' }}
                    >
                        Out-Patient (Triage Queue)
                    </button>
                </div>
            </div>

            {/* Out-Patient Queue View */}
            {activeTab === 'outpatient' && !activeAppt && (
                <div className="dashboard-grid">
                    <div className="dashboard-section card">
                        <div className="section-header">
                            <Activity size={18} style={{ color: '#0ea5e9' }} />
                            <h3>Out-Patient Triage Queue (Awaiting Vitals)</h3>
                        </div>
                        <div className="section-body">
                            {opdQueue.length === 0 ? (
                                <p className="empty-state">No out-patients currently awaiting vitals.</p>
                            ) : (
                                opdQueue.map(appt => {
                                    const p = patients.find(pat => pat.id === appt.patientId || pat.patientID === appt.patientId);
                                    return (
                                        <div key={appt.id} className="appt-item" style={{ cursor: 'pointer' }} onClick={() => handleOpenOPD(appt)}>
                                            <div className="info-col">
                                                <strong>{p?.name || 'Unknown Patient'}</strong>
                                                <span className="small-text">{appt.ward} &bull; {appt.time}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                {appt.priority === 'Urgent' && <span className="status-tag urgent">Urgent</span>}
                                                <span className="status-tag active">Awaiting Vitals</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* In-Patient Ward View */}
            {activeTab === 'inpatient' && !activeAdmission && (
                <div className="dashboard-grid">
                    <div className="dashboard-section card">
                        <div className="section-header">
                            <BedDouble size={18} style={{ color: '#0ea5e9' }} />
                            <h3>Admitted Patients {nurseWard ? `(${nurseWard})` : ''}</h3>
                        </div>
                        <div className="section-body">
                            {myAdmissions.length === 0 ? (
                                <p className="empty-state">No admitted patients currently.</p>
                            ) : (
                                myAdmissions.map(adm => {
                                    const p = patients.find(pat => pat.id === adm.patientId);
                                    return (
                                        <div key={adm.id} className={`appt-item ${adm.status === 'ReadyForRelease' ? 'ready-discharge' : ''}`} style={{ cursor: 'pointer' }} onClick={() => handleOpenPatient(adm)}>
                                            <div className="info-col">
                                                <strong>{adm.patientName}</strong>
                                                <span className="small-text">{adm.roomName} - Bed {adm.bedNumber}</span>
                                            </div>
                                            <span className={`status-tag ${adm.status === 'ReadyForRelease' ? 'ready' : 'active'}`}>
                                                {adm.status === 'ReadyForRelease' ? 'Ready for Release' : 'Active'}
                                            </span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Active In-Patient Note Entry */}
            {activeTab === 'inpatient' && activeAdmission && activePatient && (
                <div className="doctor-portal-page" style={{ padding: 0 }}>
                    <div className="consult-header" style={{ borderRadius: '12px', marginBottom: '1.5rem', background: 'white', border: '1px solid #e2e8f0', padding: '1rem 1.5rem' }}>
                        <div className="consult-breadcrumb" style={{ marginBottom: '1rem' }}>
                            <button className="back-btn" onClick={() => setActiveAdmission(null)}>← Back to Ward List</button>
                        </div>
                        <div className="consult-patient-banner" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <div className="consult-patient-avatar">{activePatient.name?.charAt(0)}</div>
                            <div>
                                <h3 style={{ margin: 0 }}>{activePatient.name}</h3>
                                <span className="consult-meta">{activePatient.age}yrs &bull; {activePatient.gender}</span>
                            </div>
                            <div style={{ marginLeft: 'auto', textAlign: 'right', display: 'flex', gap: '15px', alignItems: 'center' }}>
                                <div>
                                    <strong>{activeAdmission.roomName}</strong>
                                    <div className="small-text">Bed {activeAdmission.bedNumber}</div>
                                </div>
                                {activeAdmission.status === 'ReadyForRelease' && (
                                    <button className="finalize-discharge-btn" onClick={handleFinalizeDischarge} disabled={submittingDischarge}>
                                        <LogOut size={16} /> Finalize Discharge
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '2rem' }}>
                        {noteSubmitted ? (
                            <div className="note-success">
                                <CheckCircle2 size={48} className="success-green" />
                                <h3>Nursing Notes Saved & Signed</h3>
                                <p>Vitals and observations have been recorded for <strong>{activePatient.name}</strong>.</p>
                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem' }}>
                                    <button className="secondary-btn" onClick={() => { setNoteSubmitted(false); setClinicalForm(p => ({ ...p, chiefComplaint: '', vitalSigns: { bp: '', temp: '', pulse: '', resp: '', spo2: '', weight: '' }, notes: '' })); }}>Write Another Note</button>
                                    <button className="primary-btn" onClick={() => setActiveAdmission(null)}>Back to Ward</button>
                                </div>
                            </div>
                        ) : (
                            <form className="clinical-form" onSubmit={handleSubmitNote}>
                                <div className="clinical-form-title">
                                    <FileText size={18} /> Clinical Encounter Record
                                    <span className="lab-badge">Nursing Standard</span>
                                </div>
                                <div style={{ background: '#eff6ff', color: '#1d4ed8', padding: '10px 15px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.85rem', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <div><strong>Nursing Protocol:</strong> You are authorized to enter Chief Complaint, Vital Signs, and Additional Notes. Diagnosis and Orders are strictly Provider-only (Read-Only here).</div>
                                </div>
                                
                                <div className="cf-section">
                                    <div className="cf-label">1. Chief Complaint *</div>
                                    <textarea rows={2} value={clinicalForm.chiefComplaint} onChange={e => setClinicalForm(p => ({ ...p, chiefComplaint: e.target.value }))} />
                                </div>

                                <div className="cf-section">
                                    <div className="cf-label">2. Vital Signs</div>
                                    <div className="vitals-grid">
                                        <div className="vital-field"><label>BP</label><input type="text" value={clinicalForm.vitalSigns.bp} onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, bp: e.target.value } }))} onBlur={() => handleVitalBlur('bp', 'mmHg')} /></div>
                                        <div className="vital-field"><label>Temp</label><input type="text" value={clinicalForm.vitalSigns.temp} onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, temp: e.target.value } }))} onBlur={() => handleVitalBlur('temp', '°C')} /></div>
                                        <div className="vital-field"><label>Pulse</label><input type="text" value={clinicalForm.vitalSigns.pulse} onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, pulse: e.target.value } }))} onBlur={() => handleVitalBlur('pulse', 'bpm')} /></div>
                                        <div className="vital-field"><label>Resp</label><input type="text" value={clinicalForm.vitalSigns.resp} onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, resp: e.target.value } }))} onBlur={() => handleVitalBlur('resp', 'breaths/min')} /></div>
                                        <div className="vital-field"><label>SpO₂</label><input type="text" value={clinicalForm.vitalSigns.spo2} onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, spo2: e.target.value } }))} onBlur={() => handleVitalBlur('spo2', '%')} /></div>
                                        <div className="vital-field"><label>Weight</label><input type="text" value={clinicalForm.vitalSigns.weight} onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, weight: e.target.value } }))} onBlur={() => handleVitalBlur('weight', 'kg')} /></div>
                                    </div>
                                </div>

                                <div className="cf-section">
                                    <div className="cf-label">3. Diagnosis / Orders (Read-Only)</div>
                                    <textarea readOnly disabled rows={1} value={clinicalForm.diagnosis} style={{ background: '#f8fafc', color: '#94a3b8' }} />
                                </div>

                                <div className="cf-section">
                                    <div className="cf-label">8. Additional Clinical Notes</div>
                                    <textarea rows={3} value={clinicalForm.notes} onChange={e => setClinicalForm(p => ({ ...p, notes: e.target.value }))} />
                                </div>

                                <div className="digital-signature-block">
                                    <PenLine size={16} />
                                    <div className="sig-content">
                                        <span className="sig-label">Digital Signature</span>
                                        <span className="sig-name">Nurse {user.name}</span>
                                        <span className="sig-time">{new Date().toLocaleString()}</span>
                                    </div>
                                    <ShieldCheck size={18} className="sig-shield" />
                                </div>

                                <button type="submit" className="submit-note-btn">
                                    <CheckCircle2 size={18} /> Save &amp; Sign Nursing Notes
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Active Out-Patient Triage View */}
            {activeTab === 'outpatient' && activeAppt && activePatient && (
                <div className="doctor-portal-page" style={{ padding: 0 }}>
                    <div className="consult-header" style={{ borderRadius: '12px', marginBottom: '1.5rem', background: 'white', border: '1px solid #e2e8f0', padding: '1rem 1.5rem' }}>
                        <div className="consult-breadcrumb" style={{ marginBottom: '1rem' }}>
                            <button className="back-btn" onClick={() => setActiveAppt(null)}>← Back to Queue</button>
                        </div>
                        <div className="consult-patient-banner" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <div className="consult-patient-avatar">{activePatient.name?.charAt(0)}</div>
                            <div>
                                <h3 style={{ margin: 0 }}>{activePatient.name}</h3>
                                <span className="consult-meta">{activePatient.age}yrs &bull; {activePatient.gender}</span>
                            </div>
                            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                <strong>{activeAppt.ward}</strong>
                                <div className="small-text">{activeAppt.time} &bull; {activeAppt.priority}</div>
                            </div>
                        </div>
                    </div>

                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '2rem' }}>
                        {noteSubmitted ? (
                            <div className="note-success">
                                <CheckCircle2 size={48} className="success-green" />
                                <h3>Vitals Recorded & Forwarded</h3>
                                <p><strong>{activePatient.name}</strong> has been forwarded to the selected doctor.</p>
                                <button className="primary-btn" onClick={() => setActiveAppt(null)}>Back to Queue</button>
                            </div>
                        ) : (
                            <form className="clinical-form" onSubmit={handleSubmitNote}>
                                <div className="clinical-form-title">
                                    <Heart size={18} /> Outpatient Triage & Forwarding
                                    <span className="lab-badge">Release to Doctor</span>
                                </div>
                                
                                <div className="cf-section">
                                    <div className="cf-label">Chief Complaint</div>
                                    <textarea rows={2} value={clinicalForm.chiefComplaint} onChange={e => setClinicalForm(p => ({ ...p, chiefComplaint: e.target.value }))} />
                                </div>

                                <div className="cf-section">
                                    <div className="cf-label">Vital Signs</div>
                                    <div className="vitals-grid">
                                        <div className="vital-field"><label>BP</label><input type="text" value={clinicalForm.vitalSigns.bp} onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, bp: e.target.value } }))} onBlur={() => handleVitalBlur('bp', 'mmHg')} /></div>
                                        <div className="vital-field"><label>Temp</label><input type="text" value={clinicalForm.vitalSigns.temp} onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, temp: e.target.value } }))} onBlur={() => handleVitalBlur('temp', '°C')} /></div>
                                        <div className="vital-field"><label>Pulse</label><input type="text" value={clinicalForm.vitalSigns.pulse} onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, pulse: e.target.value } }))} onBlur={() => handleVitalBlur('pulse', 'bpm')} /></div>
                                        <div className="vital-field"><label>Resp</label><input type="text" value={clinicalForm.vitalSigns.resp} onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, resp: e.target.value } }))} onBlur={() => handleVitalBlur('resp', 'breaths/min')} /></div>
                                        <div className="vital-field"><label>SpO₂</label><input type="text" value={clinicalForm.vitalSigns.spo2} onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, spo2: e.target.value } }))} onBlur={() => handleVitalBlur('spo2', '%')} /></div>
                                        <div className="vital-field"><label>Weight</label><input type="text" value={clinicalForm.vitalSigns.weight} onChange={e => setClinicalForm(p => ({ ...p, vitalSigns: { ...p.vitalSigns, weight: e.target.value } }))} onBlur={() => handleVitalBlur('weight', 'kg')} /></div>
                                    </div>
                                </div>

                                <div className="cf-section">
                                    <div className="cf-label">Assign Doctor <span className="cf-req">*</span></div>
                                    <select required value={targetDoctorId} onChange={e => setTargetDoctorId(e.target.value)} className="full-select" style={{ marginTop: '0.5rem' }}>
                                        <option value="">-- Select Doctor to Forward to --</option>
                                        {availableDoctors.map(d => (
                                            <option key={d.id} value={d.id}>Dr. {d.name} ({d.specialty})</option>
                                        ))}
                                    </select>
                                    {availableDoctors.length === 0 && (
                                        <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.5rem' }}>No authorized doctors found for this ward.</p>
                                    )}
                                </div>

                                <button type="submit" className="submit-note-btn">
                                    <CheckCircle2 size={18} /> Complete Vitals & Forward to Doctor
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NursePortal;
