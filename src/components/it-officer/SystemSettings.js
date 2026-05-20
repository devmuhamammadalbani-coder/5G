import React, { useState } from 'react';
import { Settings, Save, Lock, Database, Globe, Bell } from 'lucide-react';
import './SystemSettings.css';

const SystemSettings = () => {
    const [settings, setSettings] = useState({
        hospitalName: '5G E-GURUCLINIC',
        mfaEnabled: true,
        allowEmergencyOverride: true,
        maintenanceMode: false
    });

    const handleSave = (e) => {
        e.preventDefault();
        alert("System settings updated. Changes will take effect immediately.");
    };

    return (
        <div className="system-settings-container card">
            <div className="section-header">
                <Settings size={20} />
                <h3>System Configuration</h3>
            </div>

            <form onSubmit={handleSave} className="settings-form">
                <div className="settings-grid">
                    <div className="settings-group">
                        <label><Globe size={16} /> Hospital Branding</label>
                        <input
                            value={settings.hospitalName}
                            onChange={e => setSettings({ ...settings, hospitalName: e.target.value })}
                        />
                    </div>

                    <div className="settings-group">
                        <label><Lock size={16} /> Security Controls</label>
                        <div className="toggle-item">
                            <span>Enable Two-Factor Authentication (MFA)</span>
                            <input
                                type="checkbox"
                                checked={settings.mfaEnabled}
                                onChange={e => setSettings({ ...settings, mfaEnabled: e.target.checked })}
                            />
                        </div>
                        <div className="toggle-item">
                            <span>Allow Emergency Override (Break Glass)</span>
                            <input
                                type="checkbox"
                                checked={settings.allowEmergencyOverride}
                                onChange={e => setSettings({ ...settings, allowEmergencyOverride: e.target.checked })}
                            />
                        </div>
                    </div>


                    <div className="settings-group">
                        <label><Bell size={16} /> System Status</label>
                        <div className="toggle-item warning">
                            <span>Enable Maintenance Mode</span>
                            <input
                                type="checkbox"
                                checked={settings.maintenanceMode}
                                onChange={e => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                            />
                        </div>
                    </div>
                </div>

                <div className="form-actions">
                    <button type="submit" className="primary-btn flex-btn">
                        <Save size={18} /> Apply Changes
                    </button>
                </div>
            </form>
        </div>
    );
};

export default SystemSettings;
