import React, { useState, useEffect } from 'react';
import { useAuth } from '../../services/authService';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import JobApplication from '../Application/JobApplication';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '../../utils/dateFormatter';

const EligibleJobApplication = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkEligibility = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }
      const q = query(
        collection(db, 'requests'),
        where('type', '==', 'job_application'),
        where('userId', '==', currentUser.uid)
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        // No application exists → eligible
        setEligible(true);
      } else {
        let appData = null;
        snapshot.forEach(doc => {
          appData = { id: doc.id, ...doc.data() };
        });
        // If application exists and its status is pending or rejected:
        if (appData && (appData.status === 'pending' || appData.status === 'rejected')) {
          const createdAt = new Date(appData.createdAt);
          const now = new Date();
          const diffDays = (now - createdAt) / (1000 * 3600 * 24);
          if (diffDays >= 14) {
            setEligible(true);
          } else {
            // Not eligible; redirect to dashboard
            setEligible(false);
            navigate('/dashboard/EmployeeApplicationDashboard', { replace: true });
          }
        } else {
          // If application is accepted or other status, redirect to dashboard.
          setEligible(false);
          navigate('/dashboard/EmployeeApplicationDashboard', { replace: true });
        }
      }
      setLoading(false);
    };

    checkEligibility();
  }, [currentUser, navigate]);

  if (loading) return <div>Loading...</div>;

  return eligible ? <JobApplication /> : null;
};

export default EligibleJobApplication;