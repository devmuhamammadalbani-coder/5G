import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { getTemplateByRole } from '../utils/templates';
import { PlusCircle, Pill, Activity, ShieldAlert, Clock, AlertTriangle, ShieldOff, Lock, User, Save } from 'lucide-react';
import auditLogger from '../utils/auditLogger';
import Preloader from '../components/common/Preloader';

const ClinicalNotes = () => {
    const { user } = useAuth();
    const { notes, addNote, patients, loading } = useData();
    const template = getTemplateByRole(user.role);

    const [showNewNoteForm, setShowNewNoteForm] = useState(false);
    const [selectedPatientId, setSelectedPatientId] = useState('');
    const [templateData, setTemplateData] = useState({});

    const handleSaveNote = (e) => {
        e.preventDefault();
        if (!selectedPatientId) return alert('Please select a patient first.');

        const patient = patients.find(p => p.id === parseInt(selectedPatientId));

        const noteEntry = {
            patientId: patient.id,
            patientName: patient.name,
            provider: user.name,
            role: user.role,
            templateName: template.name,
            content: templateData, // Store as object
            isConfidential: true
        };

        addNote(noteEntry);
        auditLogger.log(user, 'WRITE', 'CLINICAL_NOTE', patient.id, `Added ${template.name} for ${patient.name}`);

        setShowNewNoteForm(false);
        setTemplateData({});
        setSelectedPatientId('');
    };

    if (loading) {
        return <Preloader message="Reading Case Folders..." />;
    }

    return (
        <div className="page-container clinical">
            <div className="page-header-flex">
                <div>
                    <h2>Clinical Records & Case Folders</h2>
                    <p>Standardized Record Templates: **{template?.name || 'View Only'}**</p>
                </div>
                {template && (
                    <button className="primary-btn flex-btn" onClick={() => setShowNewNoteForm(true)}>
                        <PlusCircle size={18} /> New {user.role} Entry
                    </button>
                )}
            </div>

            {showNewNoteForm && (
                <div className="new-note-form-card">
                    <div className="form-header-row">
                        <h3>New {template.name}</h3>
                        <button className="close-btn" onClick={() => setShowNewNoteForm(false)}><Lock size={18} /></button>
                    </div>

                    <form onSubmit={handleSaveNote}>
                        <div className="form-group">
                            <label>Select Patient Profile</label>
                            <select
                                required
                                value={selectedPatientId}
                                onChange={e => setSelectedPatientId(e.target.value)}
                                className="full-select"
                            >
                                <option value="">Select Patient...</option>
                                {patients.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} (ID: {p.id})</option>
                                ))}
                            </select>
                        </div>

                        <div className="template-fields-grid">
                            {template.fields.map(field => (
                                <div key={field.id} className="form-group">
                                    <label>{field.label}</label>
                                    {field.type === 'textarea' ? (
                                        <textarea
                                            required
                                            placeholder={field.placeholder}
                                            value={templateData[field.id] || ''}
                                            onChange={e => setTemplateData({ ...templateData, [field.id]: e.target.value })}
                                            className="clinical-textarea"
                                        />
                                    ) : (
                                        <input
                                            type={field.type}
                                            required
                                            placeholder={field.placeholder}
                                            value={templateData[field.id] || ''}
                                            onChange={e => setTemplateData({ ...templateData, [field.id]: e.target.value })}
                                            className="search-input"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="form-actions-right">
                            <button type="button" className="secondary-btn" onClick={() => setShowNewNoteForm(false)}>Discard</button>
                            <button type="submit" className="primary-btn flex-btn">
                                <Save size={16} /> Sign & Save to Folder
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="notes-timeline">
                {notes.length === 0 ? <p className="no-logs">No clinical notes recorded yet.</p> : (
                    notes.map(note => (
                        <div key={note.id} className="note-card-v2">
                            <div className="note-v2-header">
                                <div className="provider-meta">
                                    <Clock size={14} />
                                    <span>
                                        {(() => {
                                            const ds = note.createdAt || note.signedAt || note.timestamp;
                                            return ds ? (ds.toDate ? ds.toDate().toLocaleString() : new Date(ds).toLocaleString()) : 'Pending...';
                                        })()}
                                    </span>
                                    <span className="separator">•</span>
                                    <strong>{note.provider} ({note.role})</strong>
                                    <span className="separator">•</span>
                                    <User size={14} /> <span>Patient: {note.patientName}</span>
                                </div>
                                <span className="badge-v2 encounter">{note.templateName}</span>
                            </div>
                            <div className="note-v2-content">
                                <div className="template-data-display">
                                    {Object.entries(note.content).map(([key, value]) => (
                                        <div key={key} className="display-item">
                                            <label>{key.charAt(0).toUpperCase() + key.slice(1)}:</label>
                                            <p>{value}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ClinicalNotes;
