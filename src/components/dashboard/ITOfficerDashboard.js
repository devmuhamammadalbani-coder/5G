import React from 'react';
import UserManagement from '../it-officer/UserManagement';
import AuditTrail from '../it-officer/AuditTrail';
import SystemSettings from '../it-officer/SystemSettings';
import './Dashboards.css';

const ITOfficerDashboard = () => {
    return (
        <div className="dashboard-v2 ito">
            <div className="dashboard-header">
                <h2>System Control Center (IT Officer)</h2>
                <div className="status-indicator">
                    <span className="dot pulse"></span>
                    Superuser Session Active
                </div>
            </div>

            <div className="dashboard-content-grid">
                <div className="full-width">
                    <UserManagement />
                </div>
                <div className="half-width">
                    <AuditTrail />
                </div>
                <div className="half-width">
                    <SystemSettings />
                </div>
            </div>
        </div>
    );
};

export default ITOfficerDashboard;
