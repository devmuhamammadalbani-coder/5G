import React, { useEffect, useState } from 'react';
import './Preloader.css';

/**
 * Preloader Component
 * @param {boolean} fullPage - Whether to cover the entire screen
 * @param {string} message - Optional message to display below the spinner
 */
const Preloader = ({ fullPage = true, message = 'SYNCHRONIZING' }) => {
  const [hideStatus, setHideStatus] = useState('');

  // Auto-hide logic simulation if needed, though usually controlled by parent
  // useEffect(() => {
  //   const timer = setTimeout(() => {
  //     setHideStatus('hide');
  //   }, 2500);
  //   return () => clearTimeout(timer);
  // }, []);

  return (
    <div className={`preloader ${hideStatus}`} id="loader">
      <div className="logo">
        <span className="five">5</span>
        <div className="sync">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
        <span className="g">G</span>
      </div>
      
      <div className="title">E-GURU <span>CLINIC</span></div>
      
      {/* REALISTIC HEARTBEAT LINE */}
      <div className="heartbeat">
        <svg viewBox="0 0 280 80" preserveAspectRatio="none">
          <path d="M0 45 L50 45 L65 20 L80 65 L95 45 L130 45 L140 35 L148 28 L156 35 L165 55 L175 45 L220 45 L235 30 L245 50 L255 45 L280 45" />
        </svg>
      </div>
      
      <div className="loading-status">
        <div className="sync-text">{message}</div>
        <div className="progress-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
};

export default Preloader;
