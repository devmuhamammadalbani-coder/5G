import React, { useState } from 'react';
import { Shield, Key, Database, ArrowRight, CheckCircle, Copy, HelpCircle } from 'lucide-react';
import './SupabaseSetupScreen.css';

const SupabaseSetupScreen = () => {
    const [copiedFile, setCopiedFile] = useState(false);

    const envContent = `# 5G E-GURU Clinic - Connection Settings
VITE_SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPER_LONG_ANON_KEY_HERE"`;

    const handleCopy = () => {
        navigator.clipboard.writeText(envContent);
        setCopiedFile(true);
        setTimeout(() => setCopiedFile(false), 2000);
    };

    return (
        <div className="setup-wrapper">
            <div className="setup-card">
                <div className="setup-header">
                    <div className="logo-badge">
                        <Shield className="logo-icon" size={32} />
                    </div>
                    <h2>5G E-GURU CLINIC</h2>
                    <p className="subtitle">Database Connection Setup Required</p>
                </div>

                <div className="setup-body">
                    <p className="intro-text">
                        The EMR application was migrated successfully to <strong>Supabase</strong>! 
                        To run the local system, we need to plug in your hosted Supabase credentials.
                    </p>

                    <div className="steps-container">
                        <div className="step-item">
                            <div className="step-number">1</div>
                            <div className="step-content">
                                <h4>Retrieve Keys from Supabase</h4>
                                <p>
                                    Go to your <strong>Supabase Dashboard</strong>, click the <strong>Settings (Gear) icon</strong> at the bottom of the left sidebar, and select <strong>API</strong>.
                                </p>
                            </div>
                        </div>

                        <div className="step-item">
                            <div className="step-number">2</div>
                            <div className="step-content">
                                <h4>Configure the Environment File</h4>
                                <p>
                                    Open the <code>.env</code> file at the root of your project folder and replace the placeholder text with your actual values:
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="code-block-container">
                        <div className="code-header">
                            <span>File: .env</span>
                            <button onClick={handleCopy} className="copy-btn">
                                {copiedFile ? <CheckCircle size={14} className="success-icon" /> : <Copy size={14} />}
                                {copiedFile ? 'Copied!' : 'Copy Code'}
                            </button>
                        </div>
                        <pre className="code-display">
                            {envContent}
                        </pre>
                    </div>

                    <div className="auth-instructions">
                        <div className="instruction-header">
                            <Database size={16} className="highlight-icon" />
                            <h4>Enable Supabase Authentication</h4>
                        </div>
                        <p>
                            To allow your staff members to log in, make sure <strong>Email Auth</strong> is enabled:
                        </p>
                        <ul>
                            <li>Go to <strong>Authentication</strong> &rarr; <strong>Providers</strong> &rarr; <strong>Email</strong>.</li>
                            <li>Turn on the <strong>Email provider</strong>.</li>
                            <li><em>Recommended:</em> Turn off <strong>"Confirm email"</strong> so you can test register and log in staff members instantly without verifying email addresses.</li>
                        </ul>
                    </div>
                </div>

                <div className="setup-footer">
                    <p className="restart-alert">
                        After saving the <code>.env</code> file, save or reload this page in the browser to start using the clinical portal!
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SupabaseSetupScreen;
