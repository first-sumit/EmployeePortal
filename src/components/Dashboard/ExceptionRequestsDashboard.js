// File: src/components/ExceptionRequestsDashboard.js
import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import './ExceptionRequestsDashboard.css';
import NewExceptionRequestPopup from './NewExceptionRequestPopup';

import { useAuth } from '../../services/authService';
import { db } from '../../services/firebase';
import { formatDate } from '../../utils/dateFormatter';
/** This shows a list of the user's exception requests with Apple-like cards. 
 *  We also have a detail view toggled by local state. 
 */
const ExceptionRequestsDashboard = ({ onBackToHome }) => {
  const { currentUser } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedRequest, setSelectedRequest] = useState(null);

  const [showNewRequestPopup, setShowNewRequestPopup] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [nextEligibleDate, setNextEligibleDate] = useState(null);

  // fetch all exception requests
  const fetchRequests = async () => {
    if (!currentUser) {
      setRequests([]);
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'requests'),
      where('type', '==', 'exception_request'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      setRequests([]);
      setLoading(false);
      setEligible(true); // no requests => user is eligible
      return;
    }
    let arr = [];
    snap.forEach(doc => {
      arr.push({ id: doc.id, ...doc.data() });
    });
    setRequests(arr);

    // check the newest to see if <1 day old
    const newest = arr[0];
    if (newest) {
      const createdAt = newest.createdAt?.toDate();
      const now = new Date();
      const diffHours = (now - createdAt) / (1000 * 3600);
      if (diffHours >= 24) {
        setEligible(true);
      } else {
        setEligible(false);
        // next date/time
        const next = new Date(createdAt.getTime() + 24*3600*1000);
        setNextEligibleDate(next);
      }
    } else {
      // no requests => eligible
      setEligible(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchRequests();
      setLoading(false);
    };
    loadData();
  }, [currentUser]);

  // Handle submission success from the popup
  const handleNewRequestSuccess = async () => {
    setShowNewRequestPopup(false);
    await fetchRequests();
  };

  if (loading) {
    return (
      <div className="exceptions-dashboard-container">
        <p>Loading...</p>
      </div>
    );
  }

  // If a request is selected => detail view
  if (selectedRequest) {
    // Format date/time
    let submittedLine = '';
    if (selectedRequest.createdAt) {
      const dt = selectedRequest.createdAt.toDate();
      submittedLine = `Submitted on ${formatDate(dt)} @ ${dt.getHours()}:${dt.getMinutes().toString().padStart(2,'0')}`;
    }

    return (
      <div className="exceptions-dashboard-container">
        <button className="back-btn" onClick={() => setSelectedRequest(null)}>
          Back to Exceptions
        </button>
        <h2 className="exceptions-title">Exception Request Detail</h2>
        
        <div className="request-detail-card">
          <h3>{selectedRequest.title || 'No Title'}</h3>
          {submittedLine && <div className="request-submitted-line">{submittedLine} </div>
          }
          <p className="request-body">{selectedRequest.body || 'No details provided.'}</p>
        </div>
      </div>
    );
  }

  // Otherwise show the list of requests
  return (
    <div className="exceptions-dashboard-container">
      <button className="back-btn" onClick={onBackToHome}>
        Back to Home
      </button>
      <h2 className="exceptions-title">Your Exception Requests</h2>
      
      {requests.length === 0 ? (
        <p>No exception requests yet.</p>
      ) : (
        <div className="requests-list">
          {requests.map((req) => {
            let dateLine = '';
            if (req.createdAt) {
              const dt = req.createdAt.toDate();
              dateLine = formatDate(dt);
            }
            return (
              <button
                key={req.id}
                className="request-card"
                onClick={() => setSelectedRequest(req)}
              >
                <div className="request-card-content">
                  <div className="request-card-title">{req.title || 'No Title'}</div>
                  <div className="request-card-date">{dateLine}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {eligible ? (
        <button className="new-request-btn" onClick={() => setShowNewRequestPopup(true)}>
          New Request
        </button>
      ) : (
        nextEligibleDate && (
          <p className="not-eligible-text">
            You can submit a new request after {formatDate(nextEligibleDate)} @ 
            {nextEligibleDate.getHours()}:{nextEligibleDate.getMinutes().toString().padStart(2,'0')}
          </p>
        )
      )}

      {showNewRequestPopup && (
        <NewExceptionRequestPopup
          onClose={() => setShowNewRequestPopup(false)}
          onSuccess={handleNewRequestSuccess}
        />
      )}
    </div>
  );
};

export default ExceptionRequestsDashboard;