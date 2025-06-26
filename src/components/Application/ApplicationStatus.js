import React, { useState } from 'react';
import { db } from '../../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { handleError } from '../../utils/errorHandler';

const ApplicationStatus = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [applicationDetails, setApplicationDetails] = useState(null);
  const [error, setError] = useState('');

  const checkStatus = async (e) => {
    e.preventDefault();
    setError('');
    setStatus('');
    try {
      const q = query(
        collection(db, 'requests'),
        where('email', '==', email),
        where('type', '==', 'job_application')
      );
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        setStatus('No application found for this email.');
      } else {
        querySnapshot.forEach(docSnap => {
          const data = docSnap.data();
          setStatus(data.status);
          setApplicationDetails(data);
        });
      }
    } catch (err) {
      setError(handleError(err));
    }
  };

  return (
    <div className="container">
      <h2>Check Application Status</h2>
      {error && <p className="error">{error}</p>}
      <form onSubmit={checkStatus}>
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit">Check Status</button>
      </form>S
      {status && <p>Status: {status}</p>}
      {applicationDetails && applicationDetails.resumeUrl && (
        <p>
          <a href={applicationDetails.resumeUrl} target="_blank" rel="noreferrer">
            View Uploaded Resume
          </a>
        </p>
      )}
    </div>
  );
};

export default ApplicationStatus;
