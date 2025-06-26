import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../services/authService';

const ProtectedRoute = ({ children, role }) => {
  const { currentUser, role: userRole, loading } = useAuth();
  
  // If still loading, show nothing or a loading spinner
  if (loading) {
    return <div className="loading-spinner">Loading...</div>;
  }
  
  // If not authenticated, redirect to login
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  
  // Allow access if the user role matches or if the user is admin
  if (role !== userRole && userRole !== 'admin') {
    return <Navigate to={`/dashboard/${userRole}`} />;
  }
  
  return children;
};

export default ProtectedRoute;