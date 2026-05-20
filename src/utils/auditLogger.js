import { supabase } from '../supabaseClient';
import { toSnakeCase } from './caseConverter';

/**
 * Audit Logger — writes to Supabase /audit_logs (append-only, tamper-proof)
 * Security Rules prevent any update or delete on this table via RLS.
 */
const auditLogger = {
    log: (user, action, resourceType, resourceId, details = '', severity = 'INFO') => {
        if (!user) return;

        const logEntry = toSnakeCase({
            timestamp: new Date().toISOString(),
            userId: user.id || user.uid || 'unknown',
            userName: user.name || 'Unknown',
            userRole: user.role || 'Unknown',
            ward: user.specialty || 'General',
            action,
            resourceType,
            resourceId: String(resourceId),
            details,
            severity,
        });

        // Return the promise so critical operations can await/chain it
        return supabase.from('audit_logs').insert([logEntry]).then(({ error }) => {
            if (error) console.error('Audit log write failed:', error);
        });
    }
};

export default auditLogger;
