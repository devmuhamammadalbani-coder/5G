import React from 'react';
import DoctorDashboard from './DoctorDashboard';
import { Activity, Clock, ShieldAlert } from 'lucide-react';
import './Dashboards.css';

const NurseDashboard = () => {
    return (
        <div className="dashboard-v2 nurse">
            <div className="dashboard-header">
                <h2>Clinical Support Workspace</h2>
                <p>Status: Active Nurse Shift</p>
            </div>

            <div className="stats-row">
                <div className="stat-card">
                    <Activity size={24} />
                    <div className="stat-info"><h3>8</h3><span>Active Patients</span></div>
                </div>
                <div className="stat-card">
                    <Clock size={24} />
                    <div className="stat-info"><h3>2</h3><span>Pending Vitals</span></div>
                </div>
                <div className="stat-card">
                    <ShieldAlert size={24} />
                    <div className="stat-info"><h3>0</h3><span>Critical Alerts</span></div>
                </div>
            </div>

            <div className="dashboard-main-area card">
                <div className="section-header">
                    <h3>Patient Registry Access</h3>
                </div>
                <div className="padding-area">
                    {/* Nurse specific view or common search */}
                    <div className="placeholder-text">Nurse Patient Grid Loading...</div>
                </div>
            </div>
        </div>
    );
};

export default NurseDashboard;
