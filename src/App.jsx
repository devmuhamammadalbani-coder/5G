import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import ErrorBoundary from './components/common/ErrorBoundary';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DoctorPortal from './pages/DoctorPortal';
import NursePortal from './pages/NursePortal';
import Patients from './pages/Patients';
import ClinicalNotes from './pages/ClinicalNotes';
import Billing from './pages/Billing';
import PharmacyDashboard from './pages/PharmacyDashboard';
import Admin from './pages/Admin';
import AuditLogs from './pages/AuditLogs';
import Laboratory from './pages/Laboratory';
import Radiology from './pages/Radiology';
import Memo from './pages/Memo';
import Unauthorized from './pages/Unauthorized';

// Smart redirect based on role
const RoleRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'Admin') return <Navigate to="/admin" replace />;
  if (user.role === 'Laboratory') return <Navigate to="/laboratory" replace />;
  if (user.role === 'Radiology') return <Navigate to="/radiology" replace />;
  if (user.role === 'Doctor') return <Navigate to="/doctor-portal" replace />;
  if (user.role === 'Nurse') return <Navigate to="/nurse-portal" replace />;
  return <Dashboard />;
};

const App = () => {
  return (
    <AuthProvider>
      <DataProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/unauthorized" element={<Unauthorized />} />

              {/* Main Layout — protected for all authenticated users */}
              <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>

                {/* Index: Lab goes straight to /laboratory, Doctor to /doctor-portal, everyone else sees Dashboard */}
                <Route index element={<RoleRedirect />} />

                {/* Doctor Clinical Portal — Doctors ONLY */}
                <Route
                  path="doctor-portal"
                  element={
                    <ProtectedRoute allowedRoles={['Doctor']}>
                      <DoctorPortal />
                    </ProtectedRoute>
                  }
                />

                {/* Nurse Portal — Nurses ONLY */}
                <Route
                  path="nurse-portal"
                  element={
                    <ProtectedRoute allowedRoles={['Nurse']}>
                      <NursePortal />
                    </ProtectedRoute>
                  }
                />

                {/* Patient Registry: Nurse, Receptionist, Admin ONLY */}
                <Route
                  path="patients"
                  element={
                    <ProtectedRoute allowedRoles={['Receptionist', 'Admin']}>
                      <Patients />
                    </ProtectedRoute>
                  }
                />

                {/* Clinical Notes: Doctor, Nurse only */}
                <Route
                  path="clinical-notes"
                  element={
                    <ProtectedRoute allowedRoles={['Doctor', 'Nurse']}>
                      <ClinicalNotes />
                    </ProtectedRoute>
                  }
                />

                {/* Billing: Biller only */}
                <Route
                  path="billing"
                  element={
                    <ProtectedRoute allowedRoles={['Biller']}>
                      <Billing />
                    </ProtectedRoute>
                  }
                />

                {/* Pharmacy: Pharmacist, Admin */}
                <Route
                  path="pharmacy"
                  element={
                    <ProtectedRoute allowedRoles={['Pharmacist', 'Admin']}>
                      <PharmacyDashboard />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="laboratory"
                  element={
                    <ProtectedRoute allowedRoles={['Laboratory', 'Admin']}>
                      <Laboratory />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="radiology"
                  element={
                    <ProtectedRoute allowedRoles={['Radiology', 'Admin']}>
                      <Radiology />
                    </ProtectedRoute>
                  }
                />

                {/* System Admin: Admin Only */}
                <Route
                  path="admin"
                  element={
                    <ProtectedRoute allowedRoles={['Admin']}>
                      <Admin />
                    </ProtectedRoute>
                  }
                />

                {/* Memo/Messages: All authenticated users */}
                <Route
                  path="memo"
                  element={
                    <ProtectedRoute allowedRoles={['Doctor', 'Nurse', 'Receptionist', 'Biller', 'Pharmacist', 'Laboratory', 'Radiology', 'Admin']}>
                      <Memo />
                    </ProtectedRoute>
                  }
                />

                {/* Audit Logs: Admin Only */}
                <Route
                  path="audit-logs"
                  element={
                    <ProtectedRoute allowedRoles={['Admin']}>
                      <AuditLogs />
                    </ProtectedRoute>
                  }
                />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </DataProvider>
    </AuthProvider>
  );
};

export default App;
