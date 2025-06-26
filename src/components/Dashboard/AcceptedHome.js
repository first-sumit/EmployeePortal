// File: src/components/AcceptedHome.js
import React, { useEffect, useState } from 'react';
import { useAuth } from '../services/authService';
import { db } from '../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { formatDate } from '../utils/dateFormatter';
import './AcceptedHome.css';

/**
 * If you have a navigation approach (React Router), you can navigate or conditionally render.
 * For simplicity, we'll pass in a prop called onNavigateToExceptions that sets a state
 * to show the ExceptionRequestsDashboard. We also do a local query to find
 * the user’s newest accepted job app for display. 
 */
const AcceptedHome = ({ onNavigateToExceptions }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [acceptedApp, setAcceptedApp] = useState(null);

  useEffect(() => {
    const fetchAccepted = async () => {
      if (!currentUser) {
        setAcceptedApp(null);
        setLoading(false);
        return;
      }
      // Query for all job apps that are accepted
      const q = query(
        collection(db, 'requests'),
        where('type', '==', 'job_application'),
        where('userId', '==', currentUser.uid),
        where('status', '==', 'accepted')
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setAcceptedApp(null);
        setLoading(false);
        return;
      }
      let apps = [];
      snap.forEach(doc => {
        apps.push({ id: doc.id, ...doc.data() });
      });
      // sort newest first
      apps.sort((a, b) => {
        const tA = a.createdAt?.toDate?.() || 0;
        const tB = b.createdAt?.toDate?.() || 0;
        return tB - tA;
      });
      // The newest accepted
      setAcceptedApp(apps[0]);
      setLoading(false);
    };
    fetchAccepted();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="accepted-home-container">
        <p>Loading...</p>
      </div>
    );
  }

  if (!acceptedApp) {
    return (
      <div className="accepted-home-container">
        <p>No accepted application found.</p>
        {/* You could let them navigate somewhere else, e.g. to the main dashboard. */}
      </div>
    );
  }

  // Format the date
  let submittedText = '';
  if (acceptedApp.createdAt) {
    const dateObj = acceptedApp.createdAt.toDate();
    submittedText = `Submitted on ${formatDate(dateObj)}`;
  }

  return (
    <div className="accepted-home-container">
      <h2 className="accepted-home-title">Welcome Home!</h2>

      <div className="accepted-app-card">
        <h3 className="app-card-title">Latest Accepted Application</h3>
        <div className="app-field">
          <label>Name:</label>
          <span>{acceptedApp.fullName}</span>
        </div>
        <div className="app-field">
          <label>Phone:</label>
          <span>{acceptedApp.phone}</span>
        </div>
        <div className="app-field">
          <label>Email:</label>
          <span>{acceptedApp.email}</span>
        </div>
        {submittedText && <div className="app-submitted-line">{submittedText}</div>}
      </div>

      <div className="exceptions-card">
        <h3>Exception Requests</h3>
        <p>If you need special exceptions, click below to manage them.</p>
        <button className="exceptions-button" onClick={onNavigateToExceptions}>
          Go to Exception Requests
        </button>
      </div>
    </div>
  );
};

export default AcceptedHome;