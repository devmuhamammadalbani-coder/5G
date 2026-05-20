import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

const Unauthorized = () => {
    const navigate = useNavigate();

    return (
        <div className="unauthorized-page login-container">
            <div className="login-card">
                <ShieldAlert size={64} color="var(--danger-color)" className="bounce-animation" />
                <h2>Access Denied</h2>
                <p>You do not have the required permissions to view this resource.</p>
                <p className="small-text">This incident has been logged according to HIM policies.</p>
                <button className="login-submit-btn" onClick={() => navigate('/')}>
                    Return to Dashboard
                </button>
            </div>
        </div>
    );
};

export default Unauthorized;
