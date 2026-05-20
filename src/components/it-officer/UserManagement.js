import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import auditLogger from '../../utils/auditLogger';
import { UserPlus, Shield, Hash, Key } from 'lucide-react';
import './UserManagement.css';

const UserManagement = () => {
    const { user: currentUser, users, addUser, toggleUserStatus } = useAuth();
    const [newUser, setNewUser] = useState({
        email: '',
        name: '',
        role: 'Doctor',
        staffID: '',
        initialPassword: ''
    });

    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (!newUser.staffID || !newUser.initialPassword) {
            alert("Staff ID and Initial Password are required.");
            return;
        }

        try {
            await addUser({
                email: newUser.email,
                name: newUser.name,
                role: newUser.role,
                password: newUser.initialPassword,
                adminVerificationCode: newUser.staffID // Map Staff ID to verification code or handle it
            });

            auditLogger.log(currentUser, 'WRITE', 'USER_MANAGEMENT', newUser.email, `Provisioned account for ${newUser.name} (ID: ${newUser.staffID})`);

            setNewUser({ email: '', name: '', role: 'Doctor', staffID: '', initialPassword: '' });
            alert("User provisioned successfully!");
        } catch (error) {
            console.error("Error creating user:", error);
            alert("Failed to provision user: " + error.message);
        }
    };

    const handleToggleStatus = async (user) => {
        try {
            await toggleUserStatus(user.id);
            auditLogger.log(currentUser, 'WRITE', 'USER_MANAGEMENT', user.id, `${user.isActive ? 'Deauthorized' : 'Authorized'} user: ${user.email}`);
        } catch (error) {
            console.error("Error toggling status:", error);
        }
    };

    const sortedUsers = [...users].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return (
        <div className="user-management-container">
            <div className="management-grid">
                <div className="provisioning-section card">
                    <div className="section-header">
                        <UserPlus size={20} />
                        <h3>Staff Enrollment</h3>
                    </div>
                    <form onSubmit={handleCreateUser} className="provisioning-form">
                        <div className="form-group">
                            <label>Full Name</label>
                            <input
                                required
                                value={newUser.name}
                                onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                                placeholder="e.g. Dr. Jane Smith"
                            />
                        </div>
                        <div className="form-group">
                            <label>Email Address</label>
                            <input
                                type="email"
                                required
                                value={newUser.email}
                                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                placeholder="jane.smith@hospital.com"
                            />
                        </div>
                        <div className="form-group">
                            <label>Assign Role</label>
                            <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                                <option value="Doctor">Doctor</option>
                                <option value="Nurse">Nurse</option>
                                <option value="Receptionist">Record Officer / Receptionist</option>
                                <option value="Pharmacist">Pharmacist</option>
                                <option value="Biller">Medical Biller</option>
                                <option value="HIM">HIM Professional</option>
                                <option value="Admin">System Administrator</option>
                            </select>
                        </div>

                        <div className="credentials-block">
                            <div className="form-group">
                                <label><Hash size={14} /> Staff ID</label>
                                <input
                                    required
                                    value={newUser.staffID}
                                    onChange={e => setNewUser({ ...newUser, staffID: e.target.value })}
                                    placeholder="e.g. STF-2024-001"
                                />
                            </div>
                            <div className="form-group">
                                <label><Key size={14} /> Initial Password</label>
                                <input
                                    type="password"
                                    required
                                    value={newUser.initialPassword}
                                    onChange={e => setNewUser({ ...newUser, initialPassword: e.target.value })}
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <button type="submit" className="primary-btn">Complete Provisioning</button>
                    </form>
                </div>

                <div className="staff-registry-section card">
                    <div className="section-header">
                        <Shield size={20} />
                        <h3>Active Staff Directory</h3>
                    </div>
                    <div className="staff-table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Staff Member</th>
                                    <th>Staff ID</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedUsers.map(u => (
                                    <tr key={u.id}>
                                        <td>
                                            <div className="staff-info">
                                                <strong>{u.name}</strong>
                                                <span>{u.email}</span>
                                            </div>
                                        </td>
                                        <td><code className="staff-id-tag">{u.adminVerificationCode || u.staffID || 'N/A'}</code></td>
                                        <td><span className="role-chip">{u.role}</span></td>
                                        <td>
                                            <span className={`status-badge ${u.isActive ? 'active' : 'pending'}`}>
                                                {u.isActive ? 'Active' : 'Locked'}
                                            </span>
                                        </td>
                                        <td>
                                            <button
                                                className={`action-link ${u.isActive ? 'danger' : 'success'}`}
                                                onClick={() => handleToggleStatus(u)}
                                            >
                                                {u.isActive ? 'Suspend' : 'Activate'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserManagement;
