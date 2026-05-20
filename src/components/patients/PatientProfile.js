import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import { User, Calendar, Folder, X, ShieldOff, AlertTriangle } from 'lucide-react';
import auditLogger from '../../utils/auditLogger';
import { toCamelCase } from '../../utils/caseConverter';
import './PatientProfile.css';

const PatientProfile = ({ patientId, onCancel }) => {
    const { user } = useAuth();
    const [patient, setPatient] = useState(null);
    const [notes, setNotes] = useState([]);
    const [activeTab, setActiveTab] = useState('info');
    const [isBreakGlass, setIsBreakGlass] = useState(false);

    useEffect(() => {
        if (!patientId) return;

        // Fetch initial patient data
        const fetchPatient = async () => {
            const { data, error } = await supabase
                .from('patients')
                .select('*')
                .eq('id', patientId)
                .single();
            if (data) setPatient(toCamelCase(data));
            if (error) console.error(error);
        };
        fetchPatient();

        // Subscribe to patient data changes
        const patientChannel = supabase
            .channel(`public:patients:${patientId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'patients', filter: `id=eq.${patientId}` }, payload => {
                setPatient(toCamelCase(payload.new));
            })
            .subscribe();

        // Fetch initial patient notes
        const fetchNotes = async () => {
            const { data, error } = await supabase
                .from('clinical_notes')
                .select('*')
                .eq('patient_id', patientId)
                .order('timestamp', { ascending: false });
            if (data) setNotes(toCamelCase(data));
            if (error) console.error(error);
        };
        fetchNotes();

        // Subscribe to clinical notes changes
        const notesChannel = supabase
            .channel(`public:clinical_notes:${patientId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'clinical_notes', filter: `patient_id=eq.${patientId}` }, () => {
                fetchNotes();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(patientChannel);
            supabase.removeChannel(notesChannel);
        };
    }, [patientId]);

    const handleBreakGlass = () => {
        if (window.confirm("CRITICAL: Accessing restricted case folder via Emergency Override. This action will be audited. Proceed?")) {
            setIsBreakGlass(true);
            auditLogger.log(user, 'BREAK_GLASS', 'PATIENT_FOLDER', patientId, `Emergency access to case folder for ${patient?.name || 'Patient'}`, 'CRITICAL');
        }
    };

    if (!patient) return <div className="loading-profile">Loading Patient Profile...</div>;

    const showClinicalData = ['Doctor', 'Nurse', 'HIM'].includes(user.role) || isBreakGlass;

    return (
        <div className="patient-profile-container">
            <div className="profile-header">
                <div className="profile-identity">
                    <div className="profile-avatar"><User size={32} /></div>
                    <div className="profile-name">
                        <h3>{patient.name}</h3>
                        <p>ID: {patient.id} • DOB: {patient.dob}</p>
                    </div>
                </div>
                <button className="close-btn" onClick={onCancel}><X size={20} /></button>
            </div>

            <div className="profile-tabs">
                <button className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>
                    <User size={16} /> Demographics
                </button>
                <button className={`tab-btn ${activeTab === 'appointments' ? 'active' : ''}`} onClick={() => setActiveTab('appointments')}>
                    <Calendar size={16} /> Appointments
                </button>
                <button className={`tab-btn ${activeTab === 'folder' ? 'active' : ''}`} onClick={() => setActiveTab('folder')}>
                    <Folder size={16} /> Clinical Folder
                </button>
            </div>

            <div className="profile-body">
                {activeTab === 'info' && (
                    <div className="info-grid">
                        <div className="info-item"><label>Phone</label><span>{patient.phone}</span></div>
                        <div className="info-item"><label>Blood Group</label><span>{patient.bloodGroup || 'N/A'}</span></div>
                        <div className="info-item full-width"><label>Address</label><span>{patient.address}</span></div>
                        <div className="info-item"><label>Insurance</label><span>{patient.insurance || 'None'}</span></div>
                        <div className="info-item"><label>Emergency Contact</label><span>{patient.emergencyContact || 'Not Specified'}</span></div>
                    </div>
                )}

                {activeTab === 'appointments' && (
                    <div className="appointments-view">
                        <p className="placeholder-text">Syncing appointment data...</p>
                    </div>
                )}

                {activeTab === 'folder' && (
                    <div className="clinical-folder-view">
                        {!showClinicalData ? (
                            <div className="access-denied-folder">
                                <AlertTriangle size={48} />
                                <h4>Case Folder Restricted</h4>
                                <p>You do not have the authorization required to view this clinical folder.</p>
                                <button className="break-glass-primary" onClick={handleBreakGlass}>
                                    <ShieldOff size={18} /> Emergency Override (Break Glass)
                                </button>
                            </div>
                        ) : (
                            <div className="clinical-timeline">
                                {isBreakGlass && (
                                    <div className="emergency-active-banner">
                                        <ShieldOff size={16} /> BREAK GLASS OVERRIDE ACTIVE
                                    </div>
                                )}
                                {notes.length === 0 ? <p className="empty-case">No clinical notes recorded in this case folder.</p> : (
                                    notes.map(note => (
                                        <div key={note.id} className="note-card-simple">
                                            <div className="note-meta">
                                                <span>{new Date(note.timestamp).toLocaleDateString()}</span>
                                                <span className="dot">•</span>
                                                <span>{note.provider} ({note.role})</span>
                                            </div>
                                            <h5>{note.templateName}</h5>
                                            <div className="note-content-preview">
                                                {note.content && typeof note.content === 'object' && Object.entries(note.content).slice(0, 1).map(([k, v]) => (
                                                    <p key={k}>{String(v).substring(0, 100)}...</p>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PatientProfile;
