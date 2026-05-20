import React, { useState } from 'react';
import PatientSearch from '../record-officer/PatientSearch';
import PatientProfile from '../patients/PatientProfile';
import PatientConsultation from '../doctor/PatientConsultation';
import { Activity, Users, Clock, FileText } from 'lucide-react';
import './Dashboards.css';

const DoctorDashboard = () => {
    const [selectedPatientId, setSelectedPatientId] = useState(null);
    const [isConsulting, setIsConsulting] = useState(false);

    return (
        <div className="dashboard-v2 doctor">
            <div className="dashboard-header">
                <h2>Provider Clinical Workspace</h2>
                <p>Welcome back, Doctor. You have 4 patient encounters scheduled for today.</p>
            </div>

            <div className="stats-row">
                <div className="stat-card">
                    <Clock size={24} />
                    <div className="stat-info"><h3>4</h3><span>Pending Encounters</span></div>
                </div>
                <div className="stat-card">
                    <Users size={24} />
                    <div className="stat-info"><h3>12</h3><span>Total Patients Seen</span></div>
                </div>
                <div className="stat-card">
                    <FileText size={24} />
                    <div className="stat-info"><h3>8</h3><span>Unsigned Notes</span></div>
                </div>
            </div>

            {!selectedPatientId ? (
                <div className="dashboard-main-area card">
                    <div className="section-header">
                        <Activity size={20} />
                        <h3>Active Patient Registry</h3>
                    </div>
                    <div className="padding-area">
                        <PatientSearch onSelectPatient={(id) => setSelectedPatientId(id)} />
                    </div>
                </div>
            ) : isConsulting ? (
                <PatientConsultation
                    patientId={selectedPatientId}
                    patientName="Loading..."
                    onCancel={() => setIsConsulting(false)}
                    onComplete={() => {
                        setIsConsulting(false);
                        setSelectedPatientId(null);
                    }}
                />
            ) : (
                <div className="profile-focus-area">
                    <div className="action-bar-top">
                        <button className="primary-btn" onClick={() => setIsConsulting(true)}>
                            Start Clinical Encounter
                        </button>
                    </div>
                    <PatientProfile
                        patientId={selectedPatientId}
                        onCancel={() => setSelectedPatientId(null)}
                    />
                </div>
            )}
        </div>
    );
};

export default DoctorDashboard;
