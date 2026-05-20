import React, { useState } from 'react';
import PatientRegistration from '../record-officer/PatientRegistration';
import PatientSearch from '../record-officer/PatientSearch';
import DoctorBooking from '../record-officer/DoctorBooking';
import { UserPlus, Calendar, Search, Users, LayoutDashboard } from 'lucide-react';
import './Dashboards.css';

const ReceptionistDashboard = () => {
    const [view, setView] = useState('overview'); // overview, register, booking, search
    const [selectedPatient, setSelectedPatient] = useState(null);

    const renderContent = () => {
        switch (view) {
            case 'register':
                return <PatientRegistration
                    onCancel={() => setView('overview')}
                    onComplete={(id) => {
                        alert(`Patient Registered: ${id}`);
                        setView('overview');
                    }}
                />;
            case 'booking':
                return <DoctorBooking
                    patient={selectedPatient}
                    onCancel={() => {
                        setSelectedPatient(null);
                        setView('overview');
                    }}
                    onComplete={() => {
                        setSelectedPatient(null);
                        setView('overview');
                    }}
                />;
            case 'search':
                return <PatientSearch onSelectPatient={(id) => {
                    setSelectedPatient(id);
                    setView('booking');
                }} />;
            default:
                return (
                    <div className="dashboard-grid-v2 fade-in">
                        <div className="dash-card-v2" onClick={() => setView('register')}>
                            <UserPlus size={32} />
                            <h3>Register New Patient</h3>
                            <p>Enroll a new patient into the hospital registry.</p>
                        </div>
                        <div className="dash-card-v2" onClick={() => setView('search')}>
                            <Calendar size={32} />
                            <h3>Book Appointment</h3>
                            <p>Schedule a patient with an available doctor.</p>
                        </div>
                        <div className="dash-card-v2">
                            <Users size={32} />
                            <h3>View Queue</h3>
                            <p>Manage waiting lists for different clinics.</p>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="dashboard-v2 receptionist">
            <div className="dashboard-header">
                <div className="header-info">
                    <h2>Front Desk Operations</h2>
                    <p>Welcome, Receptionist. Manage patient flow and appointments.</p>
                </div>
                {view !== 'overview' && (
                    <button className="back-to-dash" onClick={() => setView('overview')}>
                        <LayoutDashboard size={18} /> Dashboard
                    </button>
                )}
            </div>

            <div className="dashboard-main-content">
                {renderContent()}
            </div>
        </div>
    );
};

export default ReceptionistDashboard;
