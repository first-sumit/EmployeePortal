import EligibleJobApplication from './components/Application/EligibleJobApplication';
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import EmployeeApplicationDashboard from './components/Dashboard/EmployeeApplicationDashboard';
import HRDashboard from './components/Dashboard/HRDashboard';
import ITDashboard from './components/Dashboard/ITDashboard';
import AdminDashboard from './components/Dashboard/AdminDashboard';
import Profile from './components/Profile/Profile';
import NewRequest from './components/Requests/NewRequest';
import RequestList from './components/Requests/RequestList';
import JobApplication from './components/Application/JobApplication';
import ApplicationStatus from './components/Application/ApplicationStatus';
import { AuthProvider } from './services/authService';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import Layout from './components/Layout';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<Layout />}>
            <Route path="/dashboard/employee" element={<ProtectedRoute role="employee"><EmployeeApplicationDashboard /></ProtectedRoute>} />
            <Route path="/dashboard/hr" element={<ProtectedRoute role="hr"><HRDashboard /></ProtectedRoute>} />
            <Route path="/dashboard/it" element={<ProtectedRoute role="it"><ITDashboard /></ProtectedRoute>} />
            <Route path="/dashboard/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute role="employee"><Profile /></ProtectedRoute>} />
            <Route path="/requests/new" element={<ProtectedRoute role="employee"><NewRequest /></ProtectedRoute>} />
            <Route path="/requests" element={<ProtectedRoute role="employee"><RequestList /></ProtectedRoute>} />
            <Route path="/application-status" element={<ApplicationStatus />} />
            <Route path="/apply" element={<ProtectedRoute role="employee"><EligibleJobApplication /></ProtectedRoute>} />
          </Route>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;