import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
    const { user, authLoading } = useAuth();

    if (authLoading) return <div className="app-loading">Loading...</div>;

    if (!user) {
        // Not logged in
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        // Logged in but doesn't have required role
        return <Navigate to="/unauthorized" replace />;
    }

    // Authorized, render the route
    return children;
};

export default ProtectedRoute;
