import React from 'react';
import './Footer.css';

const Footer = () => {
    return (
        <footer className="app-footer">
            <div className="footer-content">
                <p>&copy; {new Date().getFullYear()} Hospital Management System. All rights reserved.</p>
                <div className="footer-links">
                    <span>Privacy Policy</span>
                    <span className="separator">|</span>
                    <span>System Status: <span className="status-online">Online</span></span>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
