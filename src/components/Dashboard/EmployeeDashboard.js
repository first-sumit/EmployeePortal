import React, { useState, useEffect } from 'react';
import { useAuth } from '../../services/authService';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import JobApplication from '../Application/JobApplication';
import { Link } from 'react-router-dom';

const EmployeeApplicationDashboard = () => {
  const { currentUser } = useAuth();
  const [jobApp, setJobApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [canReapply, setCanReapply] = useState(false);
  const [nextApplyDate, setNextApplyDate] = useState(null);

  useEffect(() => {
    const fetchJobApplication = async () => {
      if (!currentUser) return;
      const q = query(
        collection(db, 'requests'),
        where('type', '==', 'job_application'),
        where('userId', '==', currentUser.uid)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        let appData = null;
        snapshot.forEach(doc => {
          appData = { id: doc.id, ...doc.data() };
        });
        setJobApp(appData);
        if (appData.status === 'pending' || appData.status === 'rejected') {
          const createdAt = new Date(appData.createdAt);
          const now = new Date();
          const diffDays = (now - createdAt) / (1000 * 3600 * 24);
          if (diffDays >= 14) {
            setCanReapply(true);
          } else {
            const nextDate = new Date(createdAt.getTime() + 14 * 24 * 3600 * 1000);
            setNextApplyDate(nextDate);
          }
        }
      }
      setLoading(false);
    };
    fetchJobApplication();
  }, [currentUser]);

  if (loading) return <div>Loading...</div>;

  if (!jobApp) {
    return (
      <div className="container">
        <JobApplication />
      </div>
    );
  }

  if (jobApp.status === 'accepted') {
    return (
      <div className="container">
        <h2>Welcome to the Employee Dashboard</h2>
        <nav>
          <Link to="/profile">Profile</Link> | <Link to="/requests/new">New Exception Request</Link> | <Link to="/requests">My Requests</Link>
        </nav>
        <div>
          <h3>Your Application Details</h3>
          <p><strong>Full Name:</strong> {jobApp.fullName}</p>
          <p><strong>Email:</strong> {jobApp.email}</p>
          <p><strong>Status:</strong> {jobApp.status}</p>
          {jobApp.resumeUrl && (
            <p>
              <a href={jobApp.resumeUrl} target="_blank" rel="noreferrer">Download Resume</a>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h2>Your Job Application Status</h2>
      <p><strong>Status:</strong> {jobApp.status}</p>
      <div>
        <h3>Your Submitted Details</h3>
        <p><strong>Full Name:</strong> {jobApp.fullName}</p>
        <p><strong>Email:</strong> {jobApp.email}</p>
        {jobApp.resumeUrl && (
          <p>
            <a href={jobApp.resumeUrl} target="_blank" rel="noreferrer">Download Resume</a>
          </p>
        )}
      </div>
      {canReapply ? (
        <div>
          <button onClick={() => window.location.reload()}>Submit New Application</button>
        </div>
      ) : (
        <p>You can submit a new application after: {nextApplyDate && nextApplyDate.toLocaleDateString()}</p>
      )}
    </div>
  );
};

export default EmployeeApplicationDashboard;
