import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { List, RefreshCw } from 'lucide-react';
import auditLogger from '../utils/auditLogger';
import { supabase } from '../supabaseClient';
import Preloader from '../components/common/Preloader';
import { toCamelCase } from '../utils/caseConverter';

const AuditLogs = () => {
    const { user } = useAuth();
    const [auditLogs, setAuditLogs] = useState([]);
    const [staffFilter, setStaffFilter] = useState('All');
    const [actionFilter, setActionFilter] = useState('All');
    const [wardFilter, setWardFilter] = useState('All');
    const [dateFilter, setDateFilter] = useState('');
    const [loading, setLoading] = useState(true);

    // Get unique staff names and wards from logs for the dropdowns
    const uniqueStaff = [...new Set(auditLogs.map(l => l.userName).filter(Boolean))].sort();
    const uniqueWards = [...new Set(auditLogs.map(l => l.ward).filter(Boolean))].sort();

    const fetchLogs = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1000);
            
        if (data) setAuditLogs(toCamelCase(data));
        if (error) console.error(error);
        setLoading(false);
    };

    useEffect(() => {
        fetchLogs();

        const channel = supabase
            .channel('public:audit_logs')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, payload => {
                setAuditLogs(prev => [toCamelCase(payload.new), ...prev]);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const refreshLogs = () => {
        fetchLogs();
        auditLogger.log(user, 'SYSTEM', 'LOGS', 'ALL', 'Manually synced logs view');
    };

    if (loading) {
        return <Preloader message="Fetching Security Logs..." />;
    }

    return (
        <div className="page-container audit-logs-page">
            <div className="page-header-flex">
                <div>
                    <h2>System Security Audit Logs</h2>
                    <p>Comprehensive tracking of all system events and access.</p>
                </div>
                <div className="badge admin">Superuser Authorization Active</div>
            </div>

            <div className="admin-section logs-section full-width-logs">
                <div className="section-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
                    <div className="flex-header">
                        <List size={20} />
                        <h3>Recent Activity</h3>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto', flexWrap: 'wrap' }}>
                        <input
                            type="date"
                            className="filter-date-input"
                            value={dateFilter}
                            onChange={e => setDateFilter(e.target.value)}
                            placeholder="Filter by Date"
                        />

                        <select
                            className="filter-select-sm"
                            value={wardFilter}
                            onChange={e => setWardFilter(e.target.value)}
                        >
                            <option value="All">All Wards</option>
                            {uniqueWards.map(ward => (
                                <option key={ward} value={ward}>{ward}</option>
                            ))}
                        </select>

                        <select
                            className="filter-select-sm"
                            value={staffFilter}
                            onChange={e => setStaffFilter(e.target.value)}
                        >
                            <option value="All">All Staff</option>
                            {uniqueStaff.map(staff => (
                                <option key={staff} value={staff}>{staff}</option>
                            ))}
                        </select>

                        <select
                            className="filter-select-sm"
                            value={actionFilter}
                            onChange={e => setActionFilter(e.target.value)}
                        >
                            <option value="All">All Actions</option>
                            <option value="LOGIN">Logins & Logout</option>
                            <option value="READ">View/Read</option>
                            <option value="WRITE">Updates/Writes</option>
                            <option value="SYSTEM">System</option>
                            <option value="BREAK_GLASS">Emergency Access</option>
                        </select>
                        <button className="refresh-btn" onClick={refreshLogs}>
                            <RefreshCw size={14} /> Sync
                        </button>
                    </div>
                </div>
                <div className="logs-container">
                    {auditLogs.length === 0 ? (
                        <p className="no-logs">No system activity recorded yet.</p>
                    ) : (
                        (() => {
                            const filteredLogs = auditLogs
                                .filter(log => actionFilter === 'All' || log.action === actionFilter || (actionFilter === 'LOGIN' && (log.action === 'LOGOUT' || log.resourceType === 'AUTH')))
                                .filter(log => staffFilter === 'All' || log.userName === staffFilter)
                                .filter(log => wardFilter === 'All' || log.ward === wardFilter)
                                .filter(log => {
                                    if (!dateFilter) return true;
                                    const logDateStr = new Date(log.timestamp || log.createdAt).toISOString().split('T')[0];
                                    return logDateStr === dateFilter;
                                })
                                .sort((a, b) => {
                                    const dateA = new Date(a.timestamp || a.createdAt);
                                    const dateB = new Date(b.timestamp || b.createdAt);
                                    return dateB - dateA;
                                })
                                .slice(0, 1000);

                            if (filteredLogs.length === 0) {
                                return <p className="no-logs">No activity matching this filter.</p>;
                            }

                            return filteredLogs.map((log, idx) => {
                                const logDate = new Date(log.timestamp || log.createdAt);
                                return (
                                    <div key={idx} className={`log-entry ${log.action.toLowerCase()}`}>
                                        <div className="log-header">
                                            <span className={`log-badge ${log.action.toLowerCase()}`}>{log.action}</span>
                                            <span className="log-time">{logDate.toLocaleString()}</span>
                                        </div>
                                        <div className="log-body">
                                            <strong>{log.userName}</strong>
                                            <span> {log.details} </span>
                                        </div>
                                    </div>
                                );
                            });
                        })()
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuditLogs;
