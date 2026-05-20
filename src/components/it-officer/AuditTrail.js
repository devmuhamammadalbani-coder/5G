import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Shield, Search, Filter, Calendar, AlertTriangle, User } from 'lucide-react';
import { toCamelCase } from '../../utils/caseConverter';
import './AuditTrail.css';

const AuditTrail = () => {
    const [logs, setLogs] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterAction, setFilterAction] = useState('ALL');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            const { data, error } = await supabase
                .from('audit_logs')
                .select('*')
                .order('timestamp', { ascending: false })
                .limit(100);
                
            if (data) setLogs(toCamelCase(data));
            if (error) console.error(error);
            setLoading(false);
        };

        fetchLogs();

        const channel = supabase
            .channel('public:audit_logs_trail')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, payload => {
                setLogs(prev => [toCamelCase(payload.new), ...prev].slice(0, 100));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const filteredLogs = logs.filter(log => {
        const matchesSearch =
            (log.userName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (log.details || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesAction = filterAction === 'ALL' || log.action === filterAction;
        return matchesSearch && matchesAction;
    });

    return (
        <div className="audit-trail-container card">
            <div className="section-header">
                <Shield size={20} />
                <h3>System security Audit Trail</h3>
                <div className="header-badge warning">Real-time Monitoring Active</div>
            </div>

            <div className="audit-controls">
                <div className="search-bar">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Filter by user or details..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="filter-group">
                    <Filter size={18} />
                    <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
                        <option value="ALL">All Actions</option>
                        <option value="BREAK_GLASS">Break Glass Overrides</option>
                        <option value="LOGIN">Logins</option>
                        <option value="WRITE">Data Modifications</option>
                        <option value="DELETE">Deletions</option>
                    </select>
                </div>
            </div>

            <div className="logs-list">
                {loading ? (
                    <div className="loading-logs">Accessing Audit Logs...</div>
                ) : filteredLogs.length === 0 ? (
                    <div className="empty-logs">No matching audit records found.</div>
                ) : (
                    filteredLogs.map(log => (
                        <div key={log.id} className={`log-item ${log.severity === 'CRITICAL' ? 'critical' : ''}`}>
                            <div className="log-icon">
                                {log.action === 'BREAK_GLASS' ? <AlertTriangle size={18} /> : <Calendar size={18} />}
                            </div>
                            <div className="log-main">
                                <div className="log-header">
                                    <span className="log-user"><User size={14} /> {log.userName} ({log.userRole})</span>
                                    <span className="log-time">{new Date(log.timestamp || log.createdAt).toLocaleString()}</span>
                                </div>
                                <div className="log-body">
                                    <span className={`log-badge ${log.action?.toLowerCase() || 'unknown'}`}>{log.action}</span>
                                    <p>{log.details}</p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default AuditTrail;
