import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import auditLogger from '../../utils/auditLogger';
import { FileText, Save, X, AlertTriangle, ShieldOff, Lock } from 'lucide-react';
import { getTemplateByRole } from '../../utils/templates';
import { toCamelCase, toSnakeCase } from '../../utils/caseConverter';
import './PatientConsultation.css';

const PatientConsultation = ({ patientId, patientName, onComplete, onCancel }) => {
    const { user } = useAuth();
    const template = getTemplateByRole(user.role);
    const [templateData, setTemplateData] = useState({});
    const [isBreakGlass, setIsBreakGlass] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSaveNote = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const noteEntry = {
                patientId,
                patientName,
                provider: user.name,
                providerUid: user.id || user.uid,
                role: user.role,
                templateName: template.name,
                content: templateData,
                isConfidential: true,
                isEmergencyOverride: isBreakGlass
            };

            const { data, error } = await supabase
                .from('clinical_notes')
                .insert([toSnakeCase(noteEntry)])
                .select()
                .single();

            if (error) throw error;

            const docData = toCamelCase(data);

            const action = isBreakGlass ? 'BREAK_GLASS' : 'WRITE';
            const severity = isBreakGlass ? 'CRITICAL' : 'INFO';
            const details = isBreakGlass
                ? `EMERGENCY OVERRIDE: Added ${template.name} for ${patientName}`
                : `Added ${template.name} for ${patientName}`;

            auditLogger.log(user, action, 'CLINICAL_NOTE', patientId, details, severity);

            if (onComplete) onComplete(docData.id);
        } catch (error) {
            console.error("Error saving note:", error);
            alert("Failed to save clinical note: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="consultation-container">
            <div className="consultation-header">
                <div className="header-info">
                    <h3><FileText size={20} /> Clinical Consultation</h3>
                    <p>Patient: <strong>{patientName}</strong> (ID: {patientId})</p>
                </div>
                <div className="header-actions">
                    {!isBreakGlass ? (
                        <button
                            className="break-glass-btn"
                            onClick={() => {
                                if (window.confirm("WARNING: Emergency Override (Break Glass) will grant immediate access but trigger a critical audit event. Proceed?")) {
                                    setIsBreakGlass(true);
                                }
                            }}
                        >
                            <ShieldOff size={16} /> Break Glass
                        </button>
                    ) : (
                        <span className="emergency-badge">
                            <AlertTriangle size={16} /> EMERGENCY OVERRIDE ACTIVE
                        </span>
                    )}
                    <button className="close-btn" onClick={onCancel}><X size={20} /></button>
                </div>
            </div>

            <form onSubmit={handleSaveNote} className="consultation-form">
                <div className="template-info-banner">
                    <Lock size={14} />
                    <span>Using System Template: <strong>{template?.name}</strong></span>
                </div>

                <div className="template-fields-grid">
                    {template.fields.map(field => (
                        <div key={field.id} className="form-group full-width">
                            <label>{field.label}</label>
                            {field.type === 'textarea' ? (
                                <textarea
                                    required
                                    placeholder={field.placeholder}
                                    value={templateData[field.id] || ''}
                                    onChange={e => setTemplateData({ ...templateData, [field.id]: e.target.value })}
                                />
                            ) : (
                                <input
                                    type={field.type}
                                    required
                                    placeholder={field.placeholder}
                                    value={templateData[field.id] || ''}
                                    onChange={e => setTemplateData({ ...templateData, [field.id]: e.target.value })}
                                />
                            )}
                        </div>
                    ))}
                </div>

                <div className="form-actions">
                    <button type="button" className="secondary-btn" onClick={onCancel} disabled={loading}>Discard</button>
                    <button type="submit" className="primary-btn flex-btn" disabled={loading}>
                        <Save size={18} /> {loading ? 'Saving to Case Folder...' : 'Sign & Complete Encounter'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default PatientConsultation;
