import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Search, Filter, Calendar, AlertTriangle, Clock, User, HardDrive } from 'lucide-react';
import { supabase } from '../supabaseClient';
import Preloader from '../components/common/Preloader';
import { toCamelCase } from '../utils/caseConverter';

const AuditReports = () => {
    const { user } = useAuth();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchLogs = async () => {
            const { data, error } = await supabase
                .from('audit_logs')
                .select('*')
                .order('timestamp', { ascending: false });
                
            if (data) {
                setLogs(toCamelCase(data));
            }
            if (error) console.error("Audit logs sync error:", error);
            setLoading(false);
        };

        fetchLogs();

        const channel = supabase
            .channel('public:audit_logs')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, payload => {
                setLogs(prev => [toCamelCase(payload.new), ...prev]);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const filteredLogs = logs.filter(log => {
        const userName = log.userName || '';
        const resourceType = log.resourceType || '';
        const details = log.details || '';
        
        const matchesSearch =
            userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            resourceType.toLowerCase().includes(searchTerm.toLowerCase()) ||
            details.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesType = filterType === 'ALL' || log.action === filterType;

        return matchesSearch && matchesType;
    });

    const getSeverityClass = (severity) => {
        switch (severity) {
            case 'CRITICAL': return 'log-severity-critical';
            case 'WARNING': return 'log-severity-warning';
            default: return 'log-severity-info';
        }
    };

    return (
        <div className="page-container audit-reports">
            <div className="page-header-flex">
                <div>
                    <h2>Compliance & Audit Reporting</h2>
                    <p>HIM Oversight: Centralized Record of All PHI Access and Overrides.</p>
                </div>
                <div className="compliance-shield">
                    <Shield size={24} />
                    <span>HIPAA Compliant Logging</span>
                </div>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <Clock size={20} />
                    <div className="stat-info">
                        <span className="stat-label">Total Logs</span>
                        <span className="stat-value">{logs.length}</span>
                    </div>
                </div>
                <div className="stat-card warning">
                    <AlertTriangle size={20} />
                    <div className="stat-info">
                        <span className="stat-label">Break Glass Events</span>
                        <span className="stat-value">{logs.filter(l => l.action === 'BREAK_GLASS').length}</span>
                    </div>
                </div>
                <div className="stat-card info">
                    <User size={20} />
                    <div className="stat-info">
                        <span className="stat-label">Active Users</span>
                        <span className="stat-value">{new Set(logs.map(l => l.userId)).size}</span>
                    </div>
                </div>
            </div>

            <div className="audit-controls">
                <div className="search-input-wrapper">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Filter by user, resource, or details..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>
                <div className="filter-group">
                    <Filter size={18} />
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="filter-select"
                    >
                        <option value="ALL">All Actions</option>
                        <option value="BREAK_GLASS">Emergency Overrides (Break Glass)</option>
                        <option value="READ">Data Access (READ)</option>
                        <option value="WRITE">Data Modification (WRITE)</option>
                        <option value="LOGIN">System Access (LOGIN)</option>
                    </select>
                </div>
            </div>

            <div className="audit-log-list">
                {loading ? (
                    <Preloader message="Syncing audit trails from 5G E-GURUCLINIC cloud..." size="small" fullPage={false} />
                ) : filteredLogs.length === 0 ? (
                    <div className="empty-state">
                        <HardDrive size={48} />
                        <p>No audit records found matching your criteria.</p>
                    </div>
                ) : (
                    filteredLogs.map((log, index) => (
                        <div key={index} className={`audit-log-card ${getSeverityClass(log.severity)}`}>
                            <div className="log-card-header">
                                <div className="log-main-info">
                                    <span className={`log-action-badge ${log.action?.toLowerCase() || 'unknown'}`}>
                                        {log.action}
                                    </span>
                                    <span className="log-timestamp">
                                        <Calendar size={14} /> {new Date(log.timestamp || log.createdAt).toLocaleString()}
                                    </span>
                                </div>
                                {log.severity === 'CRITICAL' && (
                                    <span className="critical-notice">
                                        <AlertTriangle size={14} /> REQUIRES REVIEW
                                    </span>
                                )}
                            </div>
                            <div className="log-card-body">
                                <div className="log-subject">
                                    <strong>{log.userName}</strong> ({log.userRole})
                                </div>
                                <div className="log-description">
                                    {log.action === 'BREAK_GLASS' ? 'Emergency override on ' : 'Performed ' + log.action + ' on '}
                                    <strong>{log.resourceType}</strong> (ID: {log.resourceId})
                                </div>
                                {log.details && (
                                    <div className="log-details-box">
                                        <strong>Reason/Details:</strong> {log.details}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default AuditReports;
