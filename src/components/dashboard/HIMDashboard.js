import React from 'react';
import AuditTrail from '../it-officer/AuditTrail';
import { Shield, FileBarChart, AlertCircle } from 'lucide-react';
import './Dashboards.css';

const HIMDashboard = () => {
    return (
        <div className="dashboard-v2 him">
            <div className="dashboard-header">
                <h2>Health Information Management (HIM)</h2>
                <p>Oversight of clinical coding, record integrity, and security audits.</p>
            </div>

            <div className="stats-row">
                <div className="stat-card">
                    <FileBarChart size={24} />
                    <div className="stat-info"><h3>124</h3><span>Total Clinical Notes</span></div>
                </div>
                <div className="stat-card">
                    <Shield size={24} />
                    <div className="stat-info"><h3>8</h3><span>Real-time Audits Today</span></div>
                </div>
                <div className="stat-card danger">
                    <AlertCircle size={24} />
                    <div className="stat-info"><h3>2</h3><span>Unresolved Critical Events</span></div>
                </div>
            </div>

            <div className="dashboard-main-area">
                <div className="section-header">
                    <Shield size={20} />
                    <h3>Security Oversight & Audit Logs</h3>
                </div>
                <AuditTrail />
            </div>
        </div>
    );
};

export default HIMDashboard;
