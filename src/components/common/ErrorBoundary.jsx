import React, { Component } from 'react';
import { supabase } from '../../supabaseClient';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error:", error, errorInfo);

        // Attempt to log the error to our secure audit logs if the user is authenticated
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                supabase.from('audit_logs').insert([{
                    action: 'CLIENT_ERROR',
                    user_id: session.user.id,
                    timestamp: new Date().toISOString(),
                    details: error.message,
                }]).catch(err => {
                    // Fallback if logging fails (e.g., rate limits, missing role)
                    console.error("Failed to write to audit logs:", err);
                });
            }
        });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#fdfdfd' }}>
                    <h2>Oops, something went wrong.</h2>
                    <p>The application encountered an unexpected error. Please refresh the page.</p>
                    <div style={{ padding: '20px', background: '#ffebee', color: '#c62828', textAlign: 'left', overflow: 'auto' }}>
                        <strong>Error details:</strong> {this.state.error?.message}
                        <br/><br/>
                        <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error?.stack}</pre>
                    </div>
                    <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', cursor: 'pointer', marginTop: '10px' }}>
                        Refresh Page
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
