import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { Search, Eye, UserPlus } from 'lucide-react';
import './PatientSearch.css';

const PatientSearch = ({ onSelectPatient, onRegisterNew }) => {
    const { user } = useAuth();
    const { patients, loading } = useData();
    const [searchTerm, setSearchTerm] = useState('');

    const sortedPatients = [...patients].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const filteredPatients = sortedPatients.filter(p => {
        const name = p.name || '';
        const id = p.id || '';
        const phone = p.phone || '';
        return (
            name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            phone.includes(searchTerm)
        );
    });

    return (
        <div className="patient-search-container">
            <div className="search-controls">
                <div className="search-bar">
                    <Search size={20} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search by name, ID, or phone..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                {['Receptionist', 'Admin', 'IT Officer'].includes(user.role) && (
                    <button className="primary-btn flex-btn" onClick={onRegisterNew}>
                        <UserPlus size={18} /> Register New
                    </button>
                )}
            </div>

            <div className="search-results-table">
                {loading ? (
                    <div className="loading-state">Syncing Patient Registry...</div>
                ) : filteredPatients.length === 0 ? (
                    <div className="empty-state">No patient profiles found matching "{searchTerm}"</div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Patient Name</th>
                                <th>Profile ID</th>
                                <th>Contact</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPatients.map(p => (
                                <tr key={p.id}>
                                    <td>
                                        <div className="patient-name-cell">
                                            <strong>{p.name}</strong>
                                            <span>DOB: {p.dob}</span>
                                        </div>
                                    </td>
                                    <td><code>{p.id ? p.id.substring(0, 8) : ''}...</code></td>
                                    <td>{p.phone}</td>
                                    <td>
                                        <button className="action-link" onClick={() => onSelectPatient(p.id)}>
                                            <Eye size={16} /> Open Profile
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default PatientSearch;
